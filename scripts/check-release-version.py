#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def fail(message: str) -> None:
    print(f"release version check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


package_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))[
    "version"
]
cargo_version = tomllib.loads(
    (ROOT / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8")
)["package"]["version"]
tauri_version = json.loads(
    (ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8")
)["version"]

versions = {
    "package.json": package_version,
    "src-tauri/Cargo.toml": cargo_version,
    "src-tauri/tauri.conf.json": tauri_version,
}
if len(set(versions.values())) != 1:
    fail(
        "version surfaces differ: "
        + ", ".join(f"{path}={version}" for path, version in versions.items())
    )

expected_tag = f"v{package_version}"
ref_type = os.environ.get("GITHUB_REF_TYPE")
ref = os.environ.get("GITHUB_REF", "")
is_tag_ref = ref_type == "tag" or ref.startswith("refs/tags/")
tag = os.environ.get("GITHUB_REF_NAME") if is_tag_ref else None
if is_tag_ref and not tag:
    fail("tag ref is missing GITHUB_REF_NAME")
if is_tag_ref and tag != expected_tag:
    fail(f"tag {tag!r} does not match {expected_tag!r}")
if is_tag_ref and not (ROOT / "docs" / "releases" / f"{tag}.md").is_file():
    fail(f"release notes are missing for {tag!r}")

print(f"release version contract is valid: {package_version}")
