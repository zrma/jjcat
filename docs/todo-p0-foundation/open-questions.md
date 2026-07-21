# Open Questions

## Q1: Desktop shell과 frontend stack

- Current hypothesis: Tauri 2 + Rust core.
- Fixed application identifier: `com.1day1coding.jjcat`.
- Resolution owner: P0 implementation.
- Evidence: process/SSH lifecycle, graph virtualization, keyboard input, packaging과 testability spike.
- Escalate when: 두 선택지가 product capability나 장기 platform 지원을 비호환하게 만든다.

## Q2: Plain jj CLI와 optional jjcat-agent 경계

- Default: supported `jj` CLI template와 OpenSSH stdio로 시작한다.
- Acceptance: simulated fixture에 더해 복수의 사용자 소유 원격 저장소에서 local-only
  smoke를 수행한다. 대상 identity와 raw evidence는 tracked 문서에 남기지 않는다.
- Add helper only when: structured projection, latency, cancellation 또는 version compatibility
  acceptance를 CLI만으로 만족하지 못한다.
- Escalate when: remote install 또는 privilege가 기본 workflow에 필요해진다.

## Q3: Registry storage format

- Default: versioned local application data, credential과 source content 제외.
- Resolution owner: P0 implementation.
- Evidence: round trip, migration fixture와 corrupt-state recovery.

현재 사용자 결정을 기다리는 blocker는 없다.

## Resolution

- Q1: Tauri 2 + Rust 2024 core + React/TypeScript/Vite로 확정했다.
- Q2: plain `jj` JSONL template와 OpenSSH `sh -s` stdin protocol이 local-only actual SSH
  matrix까지 통과해 helper를 도입하지 않았다.
- Q3: application data의 schema-versioned JSON으로 확정하고 migration, round trip,
  corrupt recovery와 future-schema fail-closed를 검증했다.
