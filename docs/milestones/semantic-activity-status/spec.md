# Spec: semantic-activity-status

Status: completed

## Goal

- 사용자가 진행 중인 작업을 실패 경고로 오해하지 않도록 activity와 warning의 시각적
  의미를 분리하고, 기다림이 필요한 surface에 일관된 진행 피드백을 제공한다.

## Scope

- active repository mutation 때문에 refresh가 거절된 `busy` 응답은 실패가 아니라
  repository notice와 Command Activity 모두에서 `Waiting to refresh` activity로 표시한다.
- 초기 repository load, diff와 operation load, source scan, remote folder 탐색,
  repository 추가, mutation preview/execute와 Undo/Redo에 공통 indeterminate spinner를 쓴다.
- 실제 driver/network 실패, recovery notice와 truncated diff는 기존 warning/error 의미를
  유지한다.
- Quick Look 실패를 repository refresh health와 분리한다.

## Constraints

- spinner는 장식용이며 진행 문구와 `aria-live`/`aria-busy` 의미를 대신하지 않는다.
- `prefers-reduced-motion`에서는 animation 없이 정적인 activity glyph를 표시한다.
- 기존 Activity Center의 determinate/indeterminate progress와 updater progress contract는
  변경하지 않는다.
- retry, cache와 recovery 정보는 숨기지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| A1 | done | focused model test | `busy` refresh는 activity, 실제 driver 실패는 warning으로 분류한다. |
| A2 | done | rendered interaction smoke | running/completed activity와 실제 SSH failure 경고가 각 의미에 맞게 보인다. |
| A3 | done | production frontend build | 공통 spinner를 사용하는 모든 surface가 type-check/build를 통과한다. |
| A4 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |
| A5 | done | release verification | signed tag, same-SHA CI/Release와 fresh public artifacts를 확인한다. |

## Required Evidence

- refresh notice와 repository status focused tests
- production TypeScript/Vite build
- rendered page identity, non-blank state, console health와 representative screenshot
- running/completed activity와 warning notice의 semantic class/icon 확인
- canonical repository 및 publication boundary gates
- signed release tag, same-SHA terminal CI/Release workflows와 fresh artifact verification

## Publication Impact

- public-ready frontend, version metadata와 product/release documentation을 변경한다.
- `v0.9.8` Apple Silicon macOS beta로 tag-triggered prerelease와 rolling beta manifest를
  게시한다.

## Out Of Scope

- 실제 작업의 percentage를 알 수 없는 command에 가짜 determinate progress 추가
- warning/recovery 정보의 자동 숨김
- Activity Center 또는 updater progress model 재설계

## Completion Rule

focused test, production build, rendered semantic-state smoke, canonical/publication gates,
signed tag와 same-SHA terminal CI/Release artifact 검증이 모두 통과한다.
