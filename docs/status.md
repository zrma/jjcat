# Project Status

## Current Milestone

`P2: Graph and Diff`가 active다. P0 read-only foundation과 P1 multi-repository cockpit은
완료됐다.

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
- 34px compact graph/history row, 하단 file/metadata inspector와 change search/filter
- 통합 Add dialog의 native local picker, OpenSSH alias/dropdown 및 bounded remote folder browser
- VisualJJ 방식의 local/remote inline bookmark label, source identity와 overflow
- filesystem을 건드리지 않는 registry/cache/tab 전용 repository remove
- local absolute path 및 `~/...` 입력의 canonical identity normalization
- cat outline과 change DAG를 결합한 header/application identity asset
- local, simulated SSH, local-only actual SSH 2-repository matrix와 native bundle smoke
- v1→v2 migration을 포함한 persistent tab ordering과 selected tab restart recovery
- keyboard/pointer quick switcher search, close와 reopen
- pinned/recent repository grouping과 compact freshness/error state
- repository별 refresh dedup/cancel, active/inactive interval과 bounded failure backoff
- structured argv를 사용하는 local/SSH VS Code 및 platform terminal handoff
- 40개 이상 history의 bounded row virtualization과 representative interaction fixture

아직 구현되지 않은 항목:

- multi-lane DAG와 revision keyboard navigation
- unified/side-by-side file diff surface
- conflict, outgoing와 behind projection
- operation log 및 undo preview surface
- mutation command

## Known Upstream Constraints

- `RUSTSEC-2024-0429`는 Linux/BSD Tauri/Wry GTK dependency chain의
  `upstream-linux-transitive` advisory로 허용했으며 해결된 것으로 간주하지 않는다.
- 현재 source에서 영향을 받는 iterator API의 직접 사용은 확인하지 못했다.
- `dependency-refresh-or-linux-distribution` 시점에 upstream resolution 또는 검증된
  pinned backport를 다시 판단한다. 세부 경계는 `SECURITY.md`와 P4 roadmap에 고정했다.

## Publication Boundary

- 현재 content class는 `public`이며 tracked artifact는 remote visibility와 무관하게
  `public-ready` 기준으로 검사한다.
- GitHub remote는 public으로 구성했으며 source code는 Apache License 2.0으로 제공한다.
- 모든 push는 repository gate를 통과해야 하며, public push 전에는 live
  identity/visibility 확인과 권한 있는 machine-local private-inventory gate가 추가로
  필요하다.
- public contribution과 security report의 경계는 `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/PUBLICATION.md`에 고정했다.

## Next Slice

[P2 spec](todo-p2-graph-and-diff/spec.md)의 C1부터 시작해 bounded history row 위에 multi-lane
topology model과 keyboard revision navigation을 추가한다.
