# Spec: ui-state-and-confirmation

Status: completed

## Goal

- 앱 재시작과 in-app update restart 뒤에도 native window와 history/inspector 배치를
  복원하고, mutation 확인을 위험도에 맞는 한 단계로 단순화한다.

## Context

- 기존 native window는 매번 기본 크기로 열렸고 inspector splitter는 component-local
  pixel state라 restart 때 초기화됐다.
- pointer rebase는 drop 뒤 inline checkpoint와 exact mutation preview에서 각각 확인해야
  했다.
- remote push는 exact preview 외에 phrase 입력까지 요구해 대상 확인과 무관한 마찰을
  만들었다.

## Scope

- Tauri window-state plugin으로 main window의 size, position과 maximized state를 복원한다.
- inspector 높이는 versioned local preference에 container 대비 비율로 저장하고,
  double-click reset은 저장된 값을 제거한다.
- rebase drag hover의 cycle-safe 예상 DAG는 유지하되 drop은 중간 checkpoint 없이
  backend-issued exact preview를 즉시 연다.
- 모든 typed confirmation UI와 IPC field를 제거한다.
- `jj op`로 되감을 수 있는 mutation은 preview button과 `Enter`/`Y`로 실행하고
  `Esc`/`N`으로 취소한다.
- directory 삭제와 remote push는 exact target이 표시된 pointer click으로만 실행하며
  `Enter`/`Y`를 등록하지 않는다. 취소는 `Esc`/`N`을 유지한다.

## Constraints

- opaque single-use token, repository별 serialization, execute 직전 operation/candidate
  stale recheck와 fresh postcondition을 보존한다.
- rebase drop과 preview 전환만으로 mutation을 실행하지 않는다.
- window state와 UI preference는 app-owned local data이며 registry 또는 public tracked
  artifact에 machine identity를 추가하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | isolated native restart smoke | 조정한 main window size가 quit/relaunch 뒤 복원된다. |
| C2 | done | preference unit test + native restart smoke | inspector ratio가 restart 뒤 복원되고 invalid value는 무시된다. |
| C3 | done | history drag unit test + native pointer smoke | drop이 inline checkpoint 없이 exact rebase preview 하나만 연다. |
| C4 | done | shortcut/backend tests + native preview smoke | typed input이 없고 recoverable/irreversible execution shortcut 경계가 분리된다. |
| C5 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |

## Required Evidence

- versioned preference의 valid/invalid/storage-failure unit tests
- rebase drop launch와 recoverable/irreversible keyboard policy unit tests
- remote-write preview/confirmation contract와 local bare remote integration test
- isolated app에서 window와 splitter restart 복원, direct rebase preview 및 pointer-only
  push preview를 확인한 native smoke
- canonical repository gate

## Publication Impact

- public-ready frontend, Rust dependency/configuration, unit tests와 product documentation만
  변경한다.
- native smoke에는 격리된 app identity와 local-only repository registration을 사용하고
  private path, identity와 raw output을 tracked evidence로 남기지 않는다.
- 실제 remote push, repository mutation, package publish와 release는 수행하지 않는다.

## Out Of Scope

- bookmark delete/forget 또는 force/delete push 같은 새 mutation 종류
- updater 배포와 새 release
- Linux와 Windows window-state acceptance

## Completion Rule

모든 acceptance가 deterministic test와 isolated native smoke evidence를 갖고 전체 gate를
통과한다.
