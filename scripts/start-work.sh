#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/start-work.sh --work-id <id>

Creates docs/todo-<id>/spec.md and open-questions.md if they do not exist.
USAGE
}

work_id=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-id)
      work_id="${2:-}"
      shift 2
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

if [[ ! "$work_id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "invalid or missing --work-id: $work_id" >&2
  exit 1
fi

todo_dir="docs/todo-$work_id"
mkdir -p "$todo_dir"

if [[ ! -f "$todo_dir/spec.md" ]]; then
  cat >"$todo_dir/spec.md" <<EOF
# Spec: $work_id

Status: planned

## Goal

- TODO: 완료 후 관찰 가능한 결과를 적는다.

## Context

- 현재 상태, 관련 source of truth와 이 작업이 필요한 이유를 적는다.

## Scope

- TODO

## Impact

- 영향을 받는 사용자·시스템·운영 경로와 예상 변화를 적는다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | todo | \`scripts/check.sh\` | TODO |

## Required Evidence

- TODO

## Publication Impact

- 공개 tracked artifact에 추가되는 내용과 local-only evidence 경계를 적는다.
- remote write가 없으면 명시한다.

## Out Of Scope

- TODO

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과한다.
EOF
fi

if [[ ! -f "$todo_dir/open-questions.md" ]]; then
  cat >"$todo_dir/open-questions.md" <<'EOF'
# Open Questions

현재 미결 항목 없음.
EOF
fi

echo "initialized $todo_dir"
