#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import binascii
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


REPOSITORY = "zrma/jjcat"
VERSION_PATTERN = re.compile(
    r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$"
)
ARCHIVE_PATTERN = re.compile(r"^jjcat_[0-9A-Za-z.-]+_aarch64\.app\.tar\.gz$")
PLATFORMS = ("darwin-aarch64", "darwin-aarch64-app")
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def fail(message: str) -> None:
    print(f"updater manifest generation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def validate_signature(encoded: str) -> str:
    encoded = encoded.strip()
    if not encoded or len(encoded) > 16384:
        fail("signature must be a non-empty bounded Tauri signer value")

    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        fail("signature must be Base64-encoded UTF-8 Minisign data")

    lines = decoded.splitlines()
    if (
        len(lines) != 4
        or not lines[0].startswith("untrusted comment: signature from tauri secret key")
        or not lines[2].startswith("trusted comment: timestamp:")
    ):
        fail("signature does not have the expected Tauri Minisign structure")

    return encoded


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create jjcat's rolling beta updater manifest."
    )
    parser.add_argument("--version", required=True)
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--signature-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--download-url",
        help="Optional archive URL for an isolated two-version smoke.",
    )
    parser.add_argument(
        "--allow-insecure-localhost",
        action="store_true",
        help="Permit an explicit HTTP loopback download URL for local smoke only.",
    )
    return parser.parse_args()


def updater_url(arguments: argparse.Namespace) -> str:
    if not arguments.download_url:
        return (
            f"https://github.com/{REPOSITORY}/releases/download/"
            f"v{arguments.version}/{arguments.archive_name}"
        )

    parsed = urlparse(arguments.download_url)
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
        or Path(parsed.path).name != arguments.archive_name
    ):
        fail("download URL must be absolute, credential-free, and end in the archive name")
    if parsed.scheme == "https":
        return arguments.download_url
    if (
        parsed.scheme == "http"
        and arguments.allow_insecure_localhost
        and parsed.hostname.lower() in LOOPBACK_HOSTS
    ):
        return arguments.download_url
    fail("download URL must use HTTPS unless loopback HTTP is explicitly enabled")


def main() -> None:
    arguments = parse_arguments()
    if not VERSION_PATTERN.fullmatch(arguments.version):
        fail("version must be a SemVer release value without a leading v")
    if not ARCHIVE_PATTERN.fullmatch(arguments.archive_name):
        fail("archive name does not match the Apple Silicon updater contract")

    try:
        signature = validate_signature(
            Path(arguments.signature_file).read_text(encoding="utf-8")
        )
    except OSError as error:
        fail(f"could not read signature file: {error}")

    url = updater_url(arguments)
    manifest = {
        "version": arguments.version,
        "platforms": {
            platform: {"signature": signature, "url": url}
            for platform in PLATFORMS
        },
    }

    output = Path(arguments.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote updater manifest to {output}")


if __name__ == "__main__":
    main()
