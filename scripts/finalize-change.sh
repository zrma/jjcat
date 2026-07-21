#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/finalize-change.sh --verify-only
  scripts/finalize-change.sh --message "<type>: <summary>" [--bookmark main]

Runs the canonical local gate. With --message, writes a jj change description
with the configured Codex attribution and moves only the local bookmark.
This script never pushes.
USAGE
}

message=""
bookmark="main"
verify_only=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)
      if [[ $# -lt 2 || -z "${2:-}" || "${2:-}" == --* ]]; then
        echo "--message requires a value" >&2
        exit 2
      fi
      message="$2"
      shift 2
      ;;
    --bookmark)
      if [[ $# -lt 2 || -z "${2:-}" || "${2:-}" == --* ]]; then
        echo "--bookmark requires a value" >&2
        exit 2
      fi
      bookmark="$2"
      shift 2
      ;;
    --verify-only)
      verify_only=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$verify_only" -eq 1 ]]; then
  if [[ -n "$message" ]]; then
    echo "--verify-only cannot be combined with --message" >&2
    exit 2
  fi
  scripts/check.sh
  echo "local verification passed; no description, bookmark, or remote changed"
  jj status
  exit 0
fi

if [[ ! "$message" =~ ^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert):\ .+ ]]; then
  echo "invalid --message: expected '<type>: <summary>'" >&2
  exit 1
fi

scripts/check.sh

codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
attribution=$(sed -nE 's/^[[:space:]]*commit_attribution[[:space:]]*=[[:space:]]*"([^"]*)"[[:space:]]*$/\1/p' \
  "$codex_config" | head -n 1)
if [[ -z "$attribution" ]]; then
  echo "commit_attribution is not configured in $codex_config" >&2
  exit 1
fi

helper="${CODEX_HOME:-$HOME/.codex}/skills/vcs-jj/scripts/describe_with_attribution.sh"
if [[ ! -x "$helper" ]] || ! "$helper" -r @ -- "$message"; then
  trailer="Co-authored-by: $attribution"
  normalized=$(MESSAGE="$message" TRAILER="$trailer" python3 - <<'PY'
import os

message = os.environ["MESSAGE"].replace("\r\n", "\n").replace("\r", "\n")
trailer = os.environ["TRAILER"]
lines = [line.rstrip() for line in message.splitlines() if line.strip() and line.rstrip() != trailer]
print("\n".join(lines))
print()
print(trailer)
PY
)
  jj describe -r @ --message "$normalized"
fi

description=$(jj log -r @ --no-graph -T 'description')
DESCRIPTION="$description" TRAILER="Co-authored-by: $attribution" python3 - <<'PY'
import os
import sys

lines = [line.rstrip() for line in os.environ["DESCRIPTION"].splitlines() if line.strip()]
trailer = os.environ["TRAILER"]
if lines.count(trailer) != 1 or not lines or lines[-1] != trailer:
    print("attribution verification failed", file=sys.stderr)
    raise SystemExit(1)
PY

jj bookmark set "$bookmark" -r @
echo "local change finalized; no remote was changed"
jj status
