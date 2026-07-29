#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


REPOSITORY = "zrma/jjcat"
PLATFORMS = {"darwin-aarch64", "darwin-aarch64-app"}
VERSION_PATTERN = re.compile(
    r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$"
)


def fail(message: str) -> None:
    print(f"updater manifest verification failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify jjcat's rolling beta updater manifest."
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--signature", required=True)
    return parser.parse_args()


def read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"could not read manifest: {error}")


def main() -> None:
    arguments = parse_arguments()
    if not VERSION_PATTERN.fullmatch(arguments.version):
        fail("expected version is not a supported SemVer value")

    manifest_path = Path(arguments.manifest)
    archive_path = Path(arguments.archive)
    signature_path = Path(arguments.signature)
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or set(manifest) != {"version", "platforms"}:
        fail("manifest must contain only version and platforms")
    if manifest["version"] != arguments.version:
        fail("manifest version differs from the packaged release")

    platforms = manifest["platforms"]
    if not isinstance(platforms, dict) or set(platforms) != PLATFORMS:
        fail("manifest does not contain the two required macOS platform aliases")

    try:
        signature = signature_path.read_text(encoding="utf-8").strip()
    except OSError as error:
        fail(f"could not read signature: {error}")

    archive_name = archive_path.name
    expected_url = (
        f"https://github.com/{REPOSITORY}/releases/download/"
        f"v{arguments.version}/{archive_name}"
    )
    expected_entry = {"signature": signature, "url": expected_url}
    for platform, entry in platforms.items():
        if entry != expected_entry:
            fail(f"{platform} entry differs from the packaged archive contract")

    print(
        "updater manifest is valid for "
        f"{arguments.version} ({', '.join(sorted(PLATFORMS))})"
    )


if __name__ == "__main__":
    main()
