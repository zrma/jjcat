# Project Status

## Current Milestone

`P1: Multi-repository Cockpit`이 active다. P0 read-only foundation은 완료됐다.

완료된 기반:

- 제품명 `jjcat`과 tagline
- stable application identifier `com.1day1coding.jjcat`
- local/SSH multi-repository product contract
- driver, registry, cache, operation queue와 SSH trust boundary
- canonical `agent-harness-v1` 문서 구조
- repository contract와 publication boundary local gate
- `docs/todo-*` 기반 자율 작업 bootstrap
- colocated Jujutsu/Git repository
- Tauri 2 + Rust 2024 + React/TypeScript/Vite desktop runtime
- stable local/SSH repository identity와 schema-versioned JSON registry
- `jj` capability, machine-readable status/log/file projection
- bounded timeout/cancellation과 redacted error를 갖춘 OpenSSH stdio driver
- repository rail, tabs, DAG, change inspector와 cached/stale/disconnected UI
- local, simulated SSH, local-only actual SSH 2-repository matrix와 native bundle smoke

아직 구현되지 않은 항목:

- persistent open-tab ordering과 quick switcher
- background refresh와 pinned/recent repository UX
- full file diff surface와 graph virtualization
- editor/terminal handoff
- mutation command

## Publication Boundary

- 현재 content class는 `public`이며 tracked artifact는 remote visibility와 무관하게
  `public-ready` 기준으로 검사한다.
- remote repository는 아직 없고 license는 정하지 않았다.
- remote는 private 또는 public으로 시작할 수 있다. private push도 repository gate를
  통과해야 하며, public 생성·전환·push 전에는 live identity/visibility 확인과 권한 있는
  machine-local private-inventory gate가 추가로 필요하다.
- public contribution과 security report의 경계는 `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/PUBLICATION.md`에 고정했다.

## Next Slice

[P1 spec](todo-p1-multi-repository-cockpit/spec.md)의 C1부터 시작해 open-tab ordering과
selected tab을 schema migration과 함께 영속화한다.
