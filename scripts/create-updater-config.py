#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_ENDPOINT = (
    "https://github.com/zrma/jjcat/releases/download/updater-beta/latest-beta.json"
)
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}
VERSION_PATTERN = re.compile(
    r"^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$"
)


def fail(message: str) -> None:
    print(f"updater config generation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def validate_public_key(encoded: str) -> str:
    encoded = encoded.strip()
    if not encoded or len(encoded) > 4096:
        fail("public key must be a non-empty bounded Tauri signer value")

    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        fail("public key must be Base64-encoded UTF-8 Minisign data")

    lines = decoded.splitlines()
    if len(lines) != 2 or not lines[0].startswith("untrusted comment: minisign public key:"):
        fail("public key does not have the expected Minisign public-key structure")
    if not lines[1].startswith("RW"):
        fail("public key payload does not have the expected Minisign prefix")

    return encoded


def validate_endpoint(endpoint: str, allow_insecure_localhost: bool) -> dict[str, bool]:
    parsed = urlparse(endpoint)
    if not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        fail("endpoint must be an absolute URL without credentials or a fragment")

    if parsed.scheme == "https":
        return {}

    if (
        parsed.scheme == "http"
        and allow_insecure_localhost
        and parsed.hostname.lower() in LOOPBACK_HOSTS
    ):
        return {"dangerousInsecureTransportProtocol": True}

    fail("endpoint must use HTTPS unless an explicit loopback-only test override is enabled")


def read_public_key(arguments: argparse.Namespace) -> str:
    if arguments.public_key_file:
        try:
            return Path(arguments.public_key_file).read_text(encoding="utf-8")
        except OSError as error:
            fail(f"could not read public-key file: {error}")

    value = os.environ.get(arguments.public_key_env, "")
    if not value:
        fail(f"environment variable {arguments.public_key_env} is not set")
    return value


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a release-only Tauri updater configuration overlay."
    )
    parser.add_argument("--output", required=True, help="Output JSON path.")
    public_key = parser.add_mutually_exclusive_group(required=True)
    public_key.add_argument("--public-key-file")
    public_key.add_argument("--public-key-env")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument(
        "--version",
        help="Optional release version override for an isolated two-version smoke.",
    )
    parser.add_argument(
        "--allow-insecure-localhost",
        action="store_true",
        help="Permit HTTP only when the endpoint host is loopback.",
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    encoded_public_key = validate_public_key(read_public_key(arguments))
    insecure_override = validate_endpoint(
        arguments.endpoint, arguments.allow_insecure_localhost
    )

    updater = {
        "pubkey": encoded_public_key,
        "endpoints": [arguments.endpoint],
        **insecure_override,
    }
    overlay = {
        "bundle": {"createUpdaterArtifacts": True},
        "plugins": {"updater": updater},
    }
    if arguments.version:
        if not VERSION_PATTERN.fullmatch(arguments.version):
            fail("version override must be a SemVer value without a leading v")
        overlay["version"] = arguments.version

    output = Path(arguments.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(overlay, indent=2) + "\n", encoding="utf-8")
    print(f"wrote updater config overlay to {output}")


if __name__ == "__main__":
    main()
