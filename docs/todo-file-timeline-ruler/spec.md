# Spec: File Timeline Ruler

Status: active

## Goal

- File Blame/Timeline 상단을 실제 commit timestamp에 비례하는 읽기 쉬운 ruler로 바꾸고,
  pointer와 keyboard로 revision을 빠르게 미리 보고 이동할 수 있게 한다.

## Context

- `v0.9.12`의 `<input type="range">`는 history index를 균등 배치해 실제 시간 간격과 commit
  밀도를 숨기며, 양 끝 연도 외에는 탐색 단서가 없다.
- 기준 UX는 연·월 눈금, file history의 commit marker, hover/focus preview와 click navigation을
  한 timeline surface에 결합한다.

## Scope

- 실제 timestamp 비례 연·월 ruler와 선택 revision cursor
- 좁은 구간의 commit marker clustering과 cluster revision picker
- marker hover/focus preview, click 및 기존 arrow/select navigation 연동
- light/dark theme, narrow desktop window와 screen reader/keyboard 상태

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- local/SSH driver contract와 bounded 200-entry history projection은 변경하지 않는다.
- jjcat의 기존 typography, color token, header와 blame surface density를 유지한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| R1 | done | frontend unit tests | calendar scale, actual-time positions와 responsive clustering |
| R2 | done | browser interaction | hover/focus preview, singleton/cluster click와 arrow navigation |
| R3 | done | design QA | source/current comparison, theme tokens와 narrow desktop layout |
| R4 | done | `scripts/check.sh` | canonical frontend, Rust와 repository/publication gates |

## Required Evidence

- calendar model test는 연·월 tick, elapsed-time position과 rendered width 기반 clustering을
  검증하며 전체 frontend 179개 test가 통과했다.
- in-app browser에서 2022–2026 fixture의 singleton marker, same-day cluster menu, revision
  selection과 Arrow Left navigation을 실행했다. 1280 × 720과 native minimum 820 × 520에서
  document overflow와 우측 picker clipping이 없고 console warning/error가 없었다.
- local-only `design-qa.md`는 기존 slider, calendar reference와 구현을 한 comparison image로
  검토해 actionable P0/P1/P2가 없는 `passed`로 닫혔다.
- canonical `scripts/check.sh`는 frontend 179개, Rust unit 78개, local/simulated SSH driver와
  mutation integration, repository/publication contract를 통과했다.

## Publication Impact

- 구현과 milestone 문서는 public-ready다. screenshot, browser log와 local path는 local-only다.
- 이 slice는 local 구현/검증 범위이며 push, tag와 release는 별도 명시적 publication 경계다.

## Out Of Scope

- backend history limit 확장, branch-wide history와 repository-level activity graph
- 새로운 icon/image asset 또는 외부 design service

## Completion Rule

모든 local acceptance가 evidence와 함께 done이고 전체 gate가 통과했다. push, tag와 release는
사용자의 별도 publication 요청 전까지 수행하지 않는다.
