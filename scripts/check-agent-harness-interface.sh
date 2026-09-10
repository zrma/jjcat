#!/bin/sh
set -eu

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

fail() {
  printf 'agent harness interface check failed: %s\n' "$*" >&2
  exit 1
}

for required_file in \
  .ai-first.toml \
  .ai-first.lock \
  .ai-first/check.py \
  AGENTS.md \
  docs/agent-harness.md \
  docs/HANDOFF.md \
  docs/PRODUCT.md \
  docs/ARCHITECTURE.md \
  docs/PUBLICATION.md \
  docs/REPO_MANIFEST.yaml \
  scripts/check-publication-boundary.py; do
  [ -s "$required_file" ] || fail "missing or empty $required_file"
done

# 공통 generated interface와 선언/lock 정합성은 pinned standalone checker에 위임한다.

grep -Fq -- 'Repository Driver domain contract' AGENTS.md ||
  fail "jjcat transport contract is missing"
grep -Fq -- 'opaque single-use preview' AGENTS.md ||
  fail "jjcat mutation safety contract is missing"
grep -Fq -- '"source_kind": "release"' .ai-first.lock ||
  fail "framework release source is missing from lock"

python3 .ai-first/check.py
scripts/check-publication-boundary.py

printf 'agent harness interface is valid: ai-first-harness-v1 / jjcat overlay\n'
