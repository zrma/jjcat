# Open Questions

Status: resolved for P2

## Q1: Diff projection과 rendering 경계

- Default: driver는 bounded structured file hunks를 반환하고 frontend가 unified/side-by-side를
  같은 projection에서 렌더링한다.
- Evidence: local/SSH parity test와 large output behavior.
- Escalate when: `jj` version별 template 차이가 helper protocol을 요구한다.

## Q2: Large/binary file policy

- Default: metadata와 명시적 truncated/binary state를 먼저 표시하고 전체 content를 cache하지
  않는다.
- Evidence: size/output limit fixture와 user-visible fallback.
- Escalate when: threshold를 user configuration으로 노출해야 한다.

## Q3: Operation undo surface

- Default: P2는 operation log와 undo eligibility를 read-only로 보여주고 실제 undo는 P3의
  mutation precondition/preview와 함께 연다.
- Evidence: operation fixture와 disabled action semantics.
- Escalate when: read-only inspection만으로 recovery workflow를 검증할 수 없다.

현재 사용자 결정을 기다리는 blocker는 없다.

P2에서는 세 default를 그대로 채택했다. configuration 가능한 diff limit와 실제 operation
undo는 각각 이후 configuration 및 P3 mutation milestone에서 다시 판단한다.
