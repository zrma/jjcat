# Spec: P3 Safe Shaping

Status: active

## Goal

P2의 read-only graph/diff cockpit 위에 preview-first mutation, stale-operation
precondition과 recovery를 추가하고 local/SSH 저장소에서 같은 typed contract로 일상적인
Jujutsu shaping 작업을 수행한다.

## Context

P2는 operation identity와 undo eligibility를 read-only로 보여주지만 실제 command를 실행하지
않는다. P3는 이 inspection surface를 mutation entrypoint로 확장하되 graph 조작이 안전 계약을
우회하지 않고 network/remote write가 local rewrite와 명확히 구분되게 해야 한다.

## Scope

- `new`, `edit`, `describe`와 network `fetch`
- `rebase`, `squash`, path-bounded `split`, `abandon`
- 보호 규칙이 있는 bulk empty-change pruning
- operation `undo`와 실패 뒤 recovery guidance
- local bookmark move와 explicit remote-write `push`
- graph drag-and-drop rebase와 keyboard-equivalent source/destination selection

## Constraints

- local과 SSH는 같은 domain request/result와 confirmation semantics를 사용한다.
- remote command는 fixed stdio script와 encoded data를 사용하고 user input을 shell source로
  조립하지 않는다.
- mutation validation은 isolated fixture에서만 수행하며 실제 user repository와 configured
  remote를 변경하지 않는다.
- arbitrary command/revset, force/delete와 implicit bookmark movement를 제공하지 않는다.

## Safety Contract

모든 mutation은 `preview`와 `execute` 두 단계다.

1. preview는 repository identity, 현재 operation ID, exact target identity와 사용자에게
   보이는 효과를 고정한 opaque token을 반환한다.
2. execute는 같은 token과 명시적 confirmation을 요구한다.
3. jjcat 내부에서는 repository별 mutation을 하나만 실행한다.
4. 실행 직전에 current operation ID를 다시 읽는다. preview와 다르면 command를 실행하지
   않고 stale preview로 종료한다.
5. 성공 뒤 새 operation ID와 projection을 다시 읽어 반환한다. command 성공만으로 완료로
   간주하지 않는다.
6. 실패 뒤 현재 operation ID를 다시 읽어 repository가 바뀌었는지 구분하고 operation log와
   refresh를 recovery entrypoint로 제공한다.

다른 process가 operation precondition 확인과 command 시작 사이에 개입하는 inter-process
race를 완전히 잠그지는 않는다. jjcat은 이를 숨기지 않고 결과 operation divergence 또는
postcondition 불일치를 감지하면 recovery-required 상태로 종료한다.

## Mutation Matrix

| Action | Exact target | Confirmation | Result proof |
| --- | --- | --- | --- |
| new | parent commit ID(s) | standard | new working-copy change |
| edit | commit ID | standard | working copy points to target |
| describe | commit ID + full message | standard | exact description |
| fetch | selected remote or all configured remotes | network | operation changed and refreshed refs |
| rebase | source commit ID + destination commit ID | rewrite | source parent relation changed |
| squash | source commit ID + destination commit ID | rewrite | source emptied/removed and destination changed |
| split | source commit ID + exact repository filesets | rewrite | two resulting changes |
| abandon | exact commit ID(s) | destructive rewrite | targets absent |
| prune empty | enumerated candidate commit IDs | destructive rewrite | candidates absent |
| undo | exact current operation ID | recovery | current operation restored to parent state |
| bookmark move | bookmark name + commit ID | reference move | local bookmark target |
| push | bookmark name + selected Git remote | remote write | local remote-bookmark target refresh |

`split`은 interactive diff editor를 열지 않는다. preview에서 선택한 changed-file paths만
exact `root-file:` fileset으로 전달한다.

## Empty Pruning Protection

`Prune empty changes`는 preview 시점에 후보를 전부 열거하고 그 commit IDs만 execute한다.
후보는 `empty() & mutable()`이면서 아래 보호 대상이 아닌 change다.

- 현재 working-copy/edit target `@`
- root
- immutable change
- local 또는 remote bookmark가 붙은 change

execute 직전 operation ID와 후보 집합이 모두 같아야 한다. 새 후보를 암묵적으로 추가하거나
보호 대상의 bookmark를 이동/삭제하지 않는다.

## Interaction Contract

- graph row drag는 draggable source를 나타내고 valid change row만 drop target이 된다.
- drop은 실행이 아니라 source/destination이 채워진 rebase preview를 연다.
- `R`로 rebase source를 고르고 방향키로 destination을 이동한 뒤 `Enter`로 같은 preview를
  연다. `Escape`는 shaping selection을 취소한다.
- destructive rewrite, network action과 remote write는 색상뿐 아니라 text/icon/risk label로
  구분한다.
- preview에는 repository, action, exact targets, expected operation, risk, command effect와
  confirmation requirement를 표시한다. raw local/SSH command와 private path는 표시하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | pending | Rust domain/command tests | opaque preview token, validation과 stale precondition |
| C2 | pending | concurrent command test | repository별 serialization과 cross-repository independence |
| C3 | pending | local/simulated SSH fixture | new, edit, describe와 fetch parity |
| C4 | pending | isolated shaping fixture | rebase, squash, split와 abandon postconditions |
| C5 | pending | protected candidate fixture | empty pruning exact candidates와 protection |
| C6 | pending | operation fixture | undo success, stale rejection과 failure recovery |
| C7 | pending | local bare remote fixture | bookmark move와 push confirmation/postcondition |
| C8 | pending | rendered interaction smoke | pointer drop와 keyboard가 같은 rebase preview를 연다 |
| C9 | pending | native desktop smoke | preview, progress, success/error/recovery surface |
| C10 | pending | `scripts/check.sh` | canonical local gate와 current public-ready docs |

## Required Evidence

- real user repository나 configured remote를 mutation하지 않는 isolated fixture matrix
- local과 simulated SSH가 같은 request/result semantics와 redacted error를 반환함
- stale operation, duplicate execute, invalid target과 busy repository가 fail-closed임
- each mutation의 postcondition이 fresh projection/operation query로 확인됨
- drag-and-drop 및 keyboard path가 execute를 우회하지 않고 같은 preview token flow를 사용함
- remote write는 explicit confirmation 없이 실행되지 않음

## Publication Impact

- fixture는 합성 repository identity, path, author와 local bare remote만 사용한다.
- 실제 host alias, repository path, Git remote URL, credential과 raw command output을 tracked
  artifact에 기록하지 않는다.
- P3 구현 작업은 product repository의 public push를 자동 승인하지 않는다.

## Out Of Scope

- interactive diff editor embedding과 hunk-level split
- conflict resolution editor
- arbitrary revset/command entry
- force push, bookmark deletion과 remote deletion
- remote helper install/upgrade
- package signing, updater와 release

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 local/simulated SSH mutation matrix, native
interaction smoke와 canonical local gate가 통과해야 한다. status, roadmap, handoff와
architecture는 실제 runtime과 일치해야 하며 external publication은 별도 승인 경계다.
