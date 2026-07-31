# Spec: contextual-actions-ux

Status: completed

Current follow-up: `docs/milestones/ui-state-and-confirmation/spec.md`에서 remote push의 typed
confirmation도 제거하고 exact-target pointer confirmation으로 대체했다.

## Goal

- mutation 기능을 범용 `Actions` 허브에서 작업 대상 가까이 재배치해 발견성과 조작
  예측 가능성을 높인다.

## Context

- 현재 `Actions` 버튼은 서로 다른 범위의 기능을 하나의 native select에 모아 두어
  `Prune empty changes` 같은 repository-level 작업을 찾기 어렵다.
- change shaping, repository maintenance, network와 operation recovery는 서로 다른
  대상과 위험 경계를 가지므로 같은 진입점보다 대상별 entrypoint가 적합하다.
- mutation preview와 stale-operation recheck를 유지한다. exact candidate가 이미 열거되는
  protected pruning은 별도 typed phrase 없이 preview의 destructive button으로 확인한다.

## Scope

- 상단 툴바에는 repository-wide primary action인 `New`와 `Fetch`만 유지한다.
- selected change에는 visible menu와 graph row context menu로 change-level mutation을
  제공한다.
- protected empty-change pruning은 repository navigation과 repository context menu에
  명시적으로 노출한다.
- mutation dialog의 action 선택 select를 제거하고 선택한 작업의 parameter/preview에만
  집중한다.
- protected pruning은 exact candidate count가 표시된 한 번의 destructive confirmation
  button으로 실행하고, 외부 상태를 쓰는 remote push만 typed confirmation을 유지한다.
- pointer, keyboard, narrow-window와 assistive labeling을 함께 검증한다.

## Constraints

- 기존 preview-first mutation과 local/SSH parity를 보존한다.
- 모든 active workspace working copy, root, immutable 및 local/remote bookmark target의 prune 보호 규칙을
  바꾸지 않는다.
- 진행 중인 이전 change와 public tracked-artifact 경계를 보존한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | rendered desktop smoke | generic `Actions`와 native action select가 없다. |
| C2 | done | pointer/keyboard smoke | selected change의 edit/describe/rebase/squash/split/abandon 및 bookmark 작업을 visible/context menu에서 연다. |
| C3 | done | rendered desktop smoke | repository navigation과 context menu에서 protected pruning preview를 연다. |
| C4 | done | narrow-window smoke | primary toolbar와 contextual menu가 잘리거나 겹치지 않는다. |
| C5 | done | `pnpm test && pnpm build && scripts/check.sh` | 기존 mutation safety와 전체 repository gate가 통과한다. |

## Required Evidence

- desktop 및 narrow viewport의 rendered state
- change menu와 repository prune entrypoint의 interaction proof
- focused frontend checks와 canonical repository gate

## Publication Impact

- public-ready product 문서와 frontend source만 변경한다.
- 실제 repository, host, path, credential 또는 raw 실행 로그를 tracked artifact에
  기록하지 않는다.
- remote write, package publish와 release는 수행하지 않는다.

## Out Of Scope

- mutation backend semantics 변경
- 새 mutation 종류 또는 force/delete push
- OS native application menu와 P4 distribution

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과한다.
