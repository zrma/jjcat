# Escalation Policy

사용자에게 즉시 확인해야 하는 경우:

- 제품 UX나 trust model이 둘 이상의 비호환 방향으로 갈리고 current contract가 결정하지 않는 경우
- credential, private key, secret 또는 실제 private host inventory가 필요한 경우
- public history rewrite, remote bookmark 이동, repository 삭제나 force push가 필요한 경우
- remote repository owner/생성, license 변경, package publishing과 release 정책을 정해야 하는 경우
- network listener, remote helper 설치 또는 privilege 상승이 기본 동작에 들어가는 경우
- 검증 실패가 현재 milestone을 넘어선 기존 결함이나 외부 상태로 보이는 경우

그 외의 local, reversible 구현 세부사항과 검증은 현재 spec, architecture, tests를 기준으로
agent가 자율적으로 결정한다.
