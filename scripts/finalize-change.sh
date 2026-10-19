#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/finalize-change.sh --verify-only
  scripts/finalize-change.sh --message "<type>: <summary>" [--bookmark main]

Runs the canonical local gate. With --message, writes a jj change description
with the configured Codex attribution and opens a new empty working copy.
Only an explicit --bookmark moves a local bookmark; use it within an approved
publication transaction. By default main is unchanged.
This script never pushes.
USAGE
}

message=""
bookmark=""
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
  if [[ -n "$message" || -n "$bookmark" ]]; then
    echo "--verify-only cannot be combined with --message or --bookmark" >&2
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

if [[ $(jj log -r @ --no-graph -T empty) == "true" ]]; then
  echo "refusing to finalize an empty working copy" >&2
  exit 1
fi

attribution_file="${CODEX_HOME:-$HOME/.codex}/commit-attribution"
attribution=$(cat "$attribution_file")
if [[ -z "$attribution" || "$attribution" == *$'\n'* || "$attribution" == *$'\r'* ]]; then
  echo "commit-attribution must contain one non-empty line" >&2
  exit 1
fi

if [[ "$bookmark" == "main" ]]; then
  python3 scripts/check-vcs-state.py --revision @
fi
scripts/check.sh

helper="${CODEX_HOME:-$HOME/.codex}/skills/vcs-jj/scripts/describe_with_attribution.sh"
if [[ -x "$helper" ]]; then
  "$helper" -r @ -- "$message"
else
  trailer="Co-authored-by: $attribution"
  normalized=$(MESSAGE="$message" TRAILER="$trailer" python3 - <<'PY'
import os

message = os.environ["MESSAGE"].replace("\r\n", "\n").replace("\r", "\n")
trailer = os.environ["TRAILER"]
lines = [line.rstrip() for line in message.splitlines() if line.rstrip() != trailer]
print("\n".join(lines).rstrip())
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

completed=$(jj log -r @ --no-graph -T commit_id)
if [[ -n "${AI_FIRST_VCS_SESSION:-}" ]]; then
  python3 .ai-first/vcs.py integrate --revision "$completed"
fi
if [[ -n "$bookmark" ]]; then
  jj bookmark set "$bookmark" -r "$completed"
fi
jj new "$completed"
if [[ $(jj log -r @ --no-graph -T empty) != "true" ]] ||
   [[ $(jj log -r 'parents(@)' --no-graph -T 'commit_id ++ "\n"') != "$completed" ]]; then
  echo "local closeout did not produce the expected empty working copy" >&2
  exit 1
fi
echo "local change finalized with an empty working copy; no remote was changed"
jj status
