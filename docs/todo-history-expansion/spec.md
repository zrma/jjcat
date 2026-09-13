# Spec: history-expansion

Status: active

## Goal

사용자가 펼친 history를 선택·스크롤 이동으로 다시 접지 않는다.

## Context

구간 경계에 종속된 펼침 상태가 selection anchor 이동으로 유실된 것처럼 보인다.
기존 구현은 펼친 구간의 경계를 넘거나 선택 아래 구간을 펼친 후 행을 고르면 재접힌다.

## Scope

- change identity 기반 명시적 펼침 상태와 구간별 reveal/collapse.
- 두 재현 경로의 회귀 테스트, rendered keyboard/pointer smoke와 beta 배포.

## Impact

All Changes의 history 탐색 안정성을 개선한다. repository mutation은 변경하지 않는다.

## Constraints

- reference/tag/conflict anchor, 선택 행의 가시성, 원본 순서와 bounded virtualization을 보존한다.
- 검색·conflict view와 history identity 변경 시 초기화 정책을 유지한다.
- 접힌 중간 구간을 건너뛰어 펼친 경우에도 fold row는 실제 숨긴 위치를 표시한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | unit + rendered smoke | 펼친 경계 너머로 이동·복귀해도 기존 행 유지 |
| C2 | done | unit + rendered smoke | 선택 아래 10개 추가 노출 후 클릭·방향키로 이동해도 유지 |
| C3 | done | unit + rendered smoke | 구간별 Collapse, Show all, anchor와 원본 순서 보존 |
| C4 | done | scripts/check.sh | 전체 local gate 통과 |
| C5 | todo | CI + artifact + native smoke | v0.9.19 beta와 updater 배포·설치 검증 |

## Required Evidence

합성 history 회귀, browser keyboard/pointer 동작, 공개 artifact 무결성과 설치된 앱 확인.

## Publication Impact

코드, 합성 fixture와 release note만 게시한다. raw runtime 기록은 local-only로 둔다.

## Out Of Scope

backend/SSH/mutation, history loading 한도 변경, restart 간 펼침 저장, 다른 OS 배포.

## Completion Rule

검증된 동작과 제한은 architecture, release note와 현재 상태 문서로 이관하고 packet을 제거한다.
