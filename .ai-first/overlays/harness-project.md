## Project Overlay

- 사용자 문제와 MVP 경계는 `docs/PRODUCT.md`, component/transport/security boundary는
  `docs/ARCHITECTURE.md`가 소유한다.
- 현재 구현과 리스크는 `docs/status.md`, 우선순위는 `docs/roadmap.md`, 무컨텍스트
  시작점은 `docs/HANDOFF.md`다.
- local fixture와 simulated SSH fixture가 같은 driver contract를 통과해야 한다.
- transport 변경은 cancel/timeout/redaction, UI 변경은 rendered state와
  keyboard/pointer smoke, mutation은 success/stale/failure/undo evidence를 요구한다.
- 기본 transport는 listening port 없는 OpenSSH stdio이며 remote helper는 별도
  product/trust decision이다.
- 실제 repository name, host alias, username, path와 operation ID는 public fixture나
  snapshot에 넣지 않는다.

## Related Documents

- Navigation: `docs/HANDOFF.md`.
- Product and architecture: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`.
- Current state and direction: `docs/status.md`, `docs/roadmap.md`.
- Completed work: `docs/completed-milestones.md`.
- Escalation: `docs/ESCALATION_POLICY.md`.
- Publication policy: `docs/PUBLICATION.md`.
- Active work: none.
- Declared checks: `docs/REPO_MANIFEST.yaml`.
