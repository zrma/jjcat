#!/bin/sh
set -eu

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

scripts/check-agent-harness-interface.sh
scripts/check-repository-contract.py
scripts/check-release-version.py
scripts/check-publication-boundary.py --self-test

pnpm test
pnpm build

cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

sh -n scripts/check.sh
sh -n scripts/check-agent-harness-interface.sh
bash -n scripts/start-work.sh
bash -n scripts/finalize-change.sh
bash -n scripts/package-macos-release.sh
bash -n scripts/verify-macos-release.sh

python3 - <<'PY'
import ast
from pathlib import Path

for path in sorted(Path("scripts").glob("*.py")):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
print("python syntax is valid")
PY

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p 'test_*.py'

printf 'jjcat checks passed\n'
