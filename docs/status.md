# Project Status

## Current Milestone

`P3: Safe Shaping`까지 완료됐다. preview-first mutation, protected empty-change pruning과
operation recovery가 local/SSH의 같은 typed contract 위에서 동작한다.

완료된 기반:

- 제품명 `jjcat`과 tagline
- stable application identifier `com.1day1coding.jjcat`
- local/SSH multi-repository product contract
- driver, registry, cache, operation safety contract와 SSH trust boundary
- canonical `agent-harness-v1` 문서 구조
- repository contract와 publication boundary local gate
- `docs/todo-*` 기반 자율 작업 bootstrap
- colocated Jujutsu/Git repository
- Tauri 2 + Rust 2024 + React/TypeScript/Vite desktop runtime
- stable local/SSH repository identity와 schema-versioned JSON registry
- `jj` capability, machine-readable status/log/file projection
- bounded timeout/cancellation과 redacted error를 갖춘 OpenSSH stdio driver
- repository rail, tabs, DAG, change inspector와 cached/stale/disconnected UI
- 20px dense graph/history row, readable system typography와 high-contrast visual hierarchy
- flat native-style tabs와 separators, selected-row hierarchy, draggable/resizable desktop shell
- 전체 commit message/trailer, author/committer, full commit/parent identity를 보여주는 overview
- 하단 overview/file-tree/diff/operation inspector와 change metadata search/filter
- pointer/keyboard로 높이를 조절하고 double-click으로 초기화하는 history/inspector splitter
- 통합 Add dialog의 native local picker, OpenSSH alias/dropdown 및 bounded remote folder browser
- VisualJJ 방식의 local/remote inline bookmark label, source identity와 overflow
- filesystem을 건드리지 않는 registry/cache/tab 전용 repository remove
- local absolute path 및 `~/...` 입력의 canonical identity normalization
- cat outline과 change DAG를 결합한 header/application identity asset
- local, simulated SSH, local-only actual SSH 2-repository matrix와 native bundle smoke
- v1→v2 persistent tab recovery와 legacy diff cache만 무효화하는 v2→v3 migration
- keyboard/pointer quick switcher search, close와 reopen
- stable pinned/local/SSH repository grouping과 compact freshness/error state
- working copy, local/remote bookmark, conflict, operation과 last-fetched repository navigation
- repository별 refresh dedup/cancel, active/inactive interval과 bounded failure backoff
- structured argv를 사용하는 local/SSH VS Code 및 platform terminal handoff
- 40개 이상 history의 bounded row virtualization과 representative interaction fixture
- stable multi-lane change topology와 pointer/keyboard revision navigation
- selected revision/file만 읽는 512 KiB bounded local/SSH structured diff
- rename display path와 target canonical path를 분리하고 escaped exact fileset을 사용하는
  local/SSH diff selection
- 긴 줄에서도 같은 폭과 항상 보이는 독립 가로 scrollbar를 유지하는
  unified/side-by-side renderer, whitespace mode와 binary/truncated fallback
- cache freshness와 분리된 conflict 및 last-fetched outgoing/behind 상태
- operation identity를 변경하지 않는 recent operation log와 disabled undo eligibility preview
- opaque single-use preview token, repository별 mutation serialization, execute 직전
  operation/candidate stale recheck와 실패 뒤 recovery-required 분류
- local/SSH `new`, `edit`, full-message `describe`와 explicit network `fetch`
- `rebase`, complete `squash`, exact file-level `split`, exact-target `abandon`
- current working copy, root, immutable change와 local/remote bookmark target을 보존하는
  enumerated empty-change pruning
- exact current operation `undo`, local bookmark move와 typed-confirmation remote push
- graph mouse drag/drop과 `R`/방향키/`Enter` keyboard path가 공유하는 rebase preview
- fresh projection/operation log 기반 action postcondition과 cache refresh

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

P4 distribution은 별도 milestone로 연다. 우선 macOS signing/notarization, updater와 release
artifact contract를 결정하고, Linux package 작업 전 accepted GTK advisory의 upstream
resolution 또는 검증된 backport를 다시 판단한다. P3 완료는 package publication이나 release를
자동 승인하지 않는다.
