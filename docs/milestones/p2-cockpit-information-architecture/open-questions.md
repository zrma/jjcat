# Open Questions

현재 product decision 미결 항목은 없다.

- `Recent` group은 제거한다. `lastOpenedAt`은 registry compatibility와 quick-switch metadata로
  유지하지만 rail ordering에는 사용하지 않는다.
- pinned repository는 `Pinned`에 한 번만 표시하고 unpinned repository는 registry order를
  유지한 `Local` 또는 `SSH`에 표시한다.
- sidebar reference 항목은 별도 backend query를 추가하지 않고 selected cached projection의
  local/remote bookmark와 conflict metadata를 사용한다.
- 하단 기본 view는 `Overview`이며 changed file을 선택하면 `Changes`로 이동한다.
- operation history는 별도 overlay 대신 같은 inspector의 `Operations` tab에서 읽는다.
