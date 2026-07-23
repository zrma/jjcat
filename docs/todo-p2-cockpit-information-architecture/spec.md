# Spec: P2 Cockpit Information Architecture

Status: implemented and rendered QA passed

## Goal

- repository를 열 때마다 순서가 바뀌는 `Recent` rail을 제거하고 stable transport grouping으로
  spatial memory를 보존한다.
- Fork의 dense desktop cockpit을 참고하되 Jujutsu 고유 개념을 우선해 현재 저장소의
  working copy, bookmark, remote bookmark, conflict와 operation 정보를 즉시 탐색하게 한다.
- 하단 inspector를 overview, changed files/diff와 operation history 사이를 오가는 고정
  작업면으로 만든다.

## Context

- schema v2에서 도입된 `lastOpenedAt` 갱신은 recovery와 quick-switch metadata에는 유용하지만 이를
  rail 정렬에 직접 반영하면 repository를 선택할 때마다 목록의 위치가 달라진다.
- P2까지 구현된 change, bookmark, conflict, diff와 operation projection은 존재하지만
  일부 정보가 toolbar action 또는 선택 후의 단일 inspector 안에 흩어져 있었다.
- 사용자가 제공한 Fork desktop appshot은 stable reference navigation, dense history,
  overview와 file tree/diff를 오가는 하단 작업면의 비교 기준이다. tracked artifact에는
  해당 appshot이나 private repository content를 복제하지 않는다.

## Scope

- `Pinned`, `Local`, `SSH`만 사용하는 stable repository grouping
- selected repository에 한정된 `Working Copy`, `All Changes`, `Bookmarks`,
  `Remote Bookmarks`, `Conflicts`, `Operations` navigation과 bounded counts
- locally stored projection만 사용하는 `Last Fetched` 요약
- `Overview`, `Changes`, `Operations` inspector tabs
- graph/history와 inspector 높이를 조절하는 pointer/keyboard splitter
- 전체 commit message/trailer, author/committer identity와 시각, full commit/parent identity
- Fork와 같은 기본 창 크기에서 20개 이상 change를 노출하는 20px history row
- readable system typography, 10-12px text floor와 state 중심 accent color
- flat native-style repository/inspector tabs, stronger separators와 selected-row hierarchy
- native titlebar drag 및 8방향 resize hit area
- changed-file summary와 collapsible hierarchical file tree
- rename projection의 display path, canonical target path와 exact fileset 기반 local/SSH diff selection
- v2 shell state를 보존하면서 legacy projection cache만 무효화하는 registry v3 migration
- transport grouping과 history filter의 deterministic unit coverage
- current status, roadmap와 architecture의 UI contract 갱신

## Constraints

- registry schema와 `lastOpenedAt` persistence는 호환성을 위해 보존하되 rail ordering에
  사용하지 않는다.
- P2 read-only boundary를 유지하고 fetch, undo, shaping 또는 remote network mutation을
  추가하지 않는다.
- 20px history density, bounded diff loading, cache freshness와 redaction contract를
  보존한다.
- private repository name, host, path와 source content를 tracked evidence에 넣지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | `src/lib/repositories.test.ts` | last-opened 변경이 unpinned rail order를 바꾸지 않는다. |
| C2 | done | `src/lib/changeFilters.test.ts` | 모든 stable repository view가 projection을 결정적으로 filter한다. |
| C3 | done | `src/App.tsx` | navigation에 reference/conflict counts와 last-fetched state가 표시된다. |
| C4 | done | `src/components/ChangeWorkspace.tsx` | overview가 전체 message/trailer, author/committer, refs와 identity를 제공하고 file tree/diff 및 operations와 같은 inspector shell을 공유한다. |
| C5 | done | `pnpm test && pnpm build` | frontend typecheck, 32 unit tests와 production bundle을 통과한다. |
| C6 | done | `scripts/check.sh` | repository canonical gate, 39 Rust unit tests와 rename integration test를 통과한다. |
| C7 | done | local-only `design-qa.md` | 같은 크기로 정규화한 Fork/current native app 결합 비교가 P0-P2 잔여 finding 없이 통과한다. |
| C8 | done | rename local/SSH integration fixture | display-formatted rename label을 command selector로 사용하지 않는다. |
| C9 | done | registry v2 fixture | repository/tab/pin을 보존하고 legacy projection cache만 무효화한다. |
| C10 | done | packaged Tauri interaction smoke | blank titlebar drag, bottom-right resize, Overview/Changes/Operations와 unified/side-by-side diff가 실제 앱에서 동작한다. |
| C11 | done | splitter unit/native interaction smoke | graph/history와 inspector 경계가 pointer drag, 방향키와 double-click reset으로 조절된다. |

## Required Evidence

- deterministic repository grouping 및 change filter unit tests
- multiline trailer와 author/committer/full identity projection parser test
- rename을 포함한 local/simulated SSH exact-file diff integration test
- legacy projection을 포함한 registry v2→v3 migration fixture
- TypeScript production build
- canonical repository gate
- user-provided Fork appshot과 비교한 local-only design QA report. public tracked source에는
  raw screenshot, local absolute path 또는 private repository content를 남기지 않는다.

## Publication Impact

- frontend source, deterministic fixtures와 public-safe product documentation만 tracked한다.
- design QA의 conversation attachment reference와 local browser restriction은 local-only
  report로 유지한다.
- 이 slice는 remote write, visibility change, tag와 release를 수행하지 않는다.

## Out Of Scope

- fetch, rebase, squash, split, abandon, bookmark move, push와 실제 undo
- repository drag/drop ordering과 custom sidebar section
- full source tree browser, blame, commit signature와 hosting-provider metadata
- packaging, release와 cross-platform visual acceptance

## Completion Rule

C1-C11이 evidence와 함께 done이고 전체 gate와 local-only design QA가 통과하면 완료한다.
