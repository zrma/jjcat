# Spec: rebase-topology-preview

Status: completed

## Goal

- graph에서 change를 다른 change 위로 이동할 때 실행 전 예상 parent topology를
  즉시 확인하고, inline 확인 뒤 기존 exact mutation preview로 진행한다.

## Context

- 기존 pointer drag/drop은 drop 직후 mutation dialog를 열어 source와 destination은
  확인할 수 있었지만 graph 자체가 어떻게 다시 연결되는지는 보여주지 않았다.
- 긴 history에서는 destination을 찾는 동안 예상 연결 관계와 현재 drag target을 함께
  보여주는 feedback이 필요하다.

## Scope

- drag hover 중 source parent를 destination으로 바꾼 client-side 예상 DAG를 그린다.
- topology가 달라지는 row의 current layout 전체를 neutral ghost로 낮춘다.
- proposed layout 전체를 deep-blue dashed style로 다시 그린다.
- lane 번호를 bookmark 의미로 추정하지 않고 실제 bookmark metadata가 있는 target node만
  amber로 표시한다. moving bookmark target은 blue fill과 amber outline을 함께 사용한다.
- 비교 구간에는 normal-state mint geometry를 남기지 않아 current와 proposed 상태가
  색상과 선형으로 명확히 분리되게 한다.
- source와 destination을 `Moving`, `New parent`로 구분한다.
- drop은 실행하지 않고 graph 위에 `Cancel`, `Review rebase`가 있는 inline checkpoint를
  유지한다.
- review 뒤에는 기존 backend-issued opaque token과 exact-target mutation preview를
  그대로 사용한다.
- source descendant를 destination으로 선택해 cycle이 생기는 예상 topology는 받지 않는다.
- viewport 가장자리로 drag할 때 history를 bounded auto-scroll한다.

## Constraints

- client-side topology는 예상치이며 backend exact-target preview를 대체하지 않는다.
- 기존 20 px history density, virtualization과 local/SSH mutation parity를 보존한다.
- drop 또는 inline review만으로 mutation을 실행하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | focused unit tests | source parent만 바뀐 immutable 예상 projection과 cycle rejection |
| C2 | done | rendered pointer smoke | current ghost와 proposed DAG, source-only cyan highlight, source/destination label과 inline checkpoint 표시 |
| C3 | done | rendered interaction smoke | Cancel은 원래 graph로 복귀하고 Review는 exact rebase preview를 열며 실행하지 않음 |
| C4 | done | canonical repository gate | frontend, Rust와 public-ready checks 통과 |

## Required Evidence

- source parent 변경과 cycle rejection의 deterministic unit tests
- desktop pointer drag, inline Cancel과 exact preview 전환의 rendered interaction smoke
- canonical repository gate

## Publication Impact

- public-ready frontend, unit test와 product documentation만 변경한다.
- repository location, host inventory, credential 또는 raw execution output을 기록하지 않는다.
- 실제 repository mutation, remote write, package publication은 수행하지 않는다.

## Out Of Scope

- backend rebase semantics 변경
- preview 중 conflict 결과 예측
- drag hover마다 `jj` process 또는 SSH query 실행

## Completion Rule

모든 acceptance가 deterministic test와 rendered interaction evidence를 갖고 전체 gate를
통과한다.
