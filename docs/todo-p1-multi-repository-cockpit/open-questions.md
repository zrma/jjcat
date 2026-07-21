# Open Questions

## Q1: Open tabs와 repository registry의 schema 경계

- Default: registry schema v2에 ordered `openRepositoryIds`를 추가하고 selected repository를
  그 집합의 member로 검증한다.
- Resolution owner: P1 implementation.
- Evidence: v1→v2 migration, restart round trip와 closed repository reopen behavior.
- Escalate when: tab close가 registry 삭제와 같은 product meaning을 가져야 한다는 evidence가 생긴다.

## Q2: Background refresh policy

- Default: active repository는 user-triggered refresh 우선, inactive open tab은 bounded interval과
  failure backoff를 사용한다.
- Resolution owner: P1 implementation.
- Evidence: scheduler test, multi-repository latency와 stale-state clarity.
- Escalate when: remote load 또는 battery/network policy가 user-facing configuration을 요구한다.

## Q3: Editor와 terminal handoff

- Default: OS/default application과 configured command template를 분리하고 command preview에는
  repository display name만 보인다.
- Resolution owner: P1 implementation.
- Evidence: local/SSH platform smoke와 argument injection test.
- Escalate when: 특정 editor integration을 P1 기본값으로 고정해야 한다.

현재 사용자 결정을 기다리는 blocker는 없다.
