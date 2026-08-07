# Spec: graph-tag-labels

Status: completed

## Goal

- Graph history에서 bookmark와 함께 revision tag를 즉시 식별할 수 있게 한다.

## Context

- 현재 graph projection은 local/remote bookmark만 전달하므로 release tag가 달린 revision도
  일반 revision처럼 보이고 reference-centered folding에서 숨을 수 있다.
- `jj` 0.43의 `self.tags()`는 local과 SSH driver가 공유하는 log template에서 구조화된
  tag metadata를 제공한다.

## Scope

- graph와 selected-change projection에 tag 이름을 추가한다.
- 기존 projection cache에 `tags`가 없어도 역직렬화되도록 호환성을 유지한다.
- history row와 overview에 bookmark와 구분되는 read-only tag label을 표시한다.
- tag 이름을 graph search 대상으로 포함하고 tagged revision을 folding anchor로 취급한다.
- representative demo와 focused test에서 tag projection, 표시, 검색과 folding을 검증한다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- tag는 bookmark mutation이나 drag affordance를 제공하지 않는 read-only reference다.
- local과 SSH transport가 동일한 typed projection/template contract를 사용한다.
- dense history row에서 bookmark와 tag가 함께 있어도 description column을 침범하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | Rust focused test | driver JSONL이 tag를 typed `ChangeRow`로 보존하고 legacy cache를 수용한다. |
| C2 | done | Vitest focused test | tag 검색과 reference-centered folding anchor를 검증한다. |
| C3 | done | browser smoke | history row와 overview에서 distinct read-only tag label을 확인한다. |
| C4 | done | `scripts/check.sh` | canonical local gate가 통과한다. |

## Required Evidence

- focused Rust test에서 tag JSONL projection과 tag 없는 legacy projection cache를 통과했다.
- frontend test에서 tag 검색과 tagged revision의 folding anchor를 통과했다.
- representative local/SSH fixture browser smoke에서 history row와 overview의 read-only tag
  label, full text visibility와 tag search를 확인했고 console warning/error가 없었다.
- canonical `scripts/check.sh`가 frontend, Rust, local/simulated SSH integration과 publication
  boundary를 포함해 통과했다.

## Publication Impact

- tracked source/test/demo/docs만 변경하며 로컬 경로, private inventory와 raw output은
  기록하지 않는다.
- 이 slice는 local logical closeout까지만 수행하고 remote write와 release는 포함하지 않는다.

## Out Of Scope

- tag 생성/삭제/move action
- tag가 가리키는 target metadata 또는 annotated tag message viewer
- version bump, push, tag와 release publication

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과한다.
