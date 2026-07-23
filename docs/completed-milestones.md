# Completed Milestones

## 2026-07-21: AI-first Repository Foundation

- `jjcat` product identity와 local/SSH multi-repository objective를 고정했다.
- product, architecture, status, roadmap와 active P0 acceptance를 repository-owned
  source of truth로 만들었다.
- canonical agent harness, repository contract, publication boundary, CI와 local change
  finalization scripts를 추가했다.
- colocated `jj`/Git repository를 초기화했다.
- tracked artifact를 remote visibility와 분리된 public-ready 기준으로 재검토하고
  publication policy, contribution/security boundary, pre-origin repository gate와 live
  visibility 인식을 추가했다.

이 milestone 종료 시점의 검증 source of truth는 `scripts/check.sh`였으며 runtime
implementation은 다음 P0 milestone로 넘겼다.

## 2026-07-21: P0 Read-only Repository Cockpit Foundation

- Tauri 2 + Rust core와 React/TypeScript/Vite frontend를 선택하고 native macOS bundle을
  실제 실행했다.
- stable local/SSH identity, schema-versioned registry, migration과 corrupt recovery를
  구현했다.
- machine-readable `jj` projection과 bounded/cancellable local/OpenSSH stdio driver를
  같은 contract로 구현했다.
- repository rail, tabs, DAG, change inspector와 cached/stale/disconnected states를
  desktop 및 narrow viewport에서 검증했다.
- local fixture, simulated SSH fixture와 local-only actual SSH 2-repository matrix를
  통과했다. private host, path와 raw output은 tracked evidence에 남기지 않았다.

## 2026-07-22: P1 Multi-repository Cockpit

- registry schema v2 migration으로 open tab order, selected tab, pinned와 recent state를 restart
  이후에도 복구한다.
- keyboard/pointer quick switcher, tab close/reopen과 repository freshness/error badges를
  compact cockpit에 통합했다.
- repository별 background refresh dedup, cancellation, active/inactive interval과 bounded failure
  backoff를 추가하고 실패 중 last-known cache를 유지한다.
- local/SSH repository를 structured argv로 VS Code 또는 platform terminal에 넘기는 handoff를
  추가하고 preview에서 private context를 제외했다.
- representative 160-row fixture에서 visible window만 DOM에 유지하는 history virtualization과
  중간 revision interaction을 검증했다.
- native desktop, owner-controlled SSH 2-repository matrix와 canonical local gate를 통과했다.
  private identity, path와 raw output은 tracked evidence에 남기지 않았다.

## 2026-07-23: P2 Graph and Diff

- parent relation을 deterministic multi-lane topology로 계산하고 bounded virtual history에서
  pointer/keyboard revision navigation을 통합했다.
- selected revision/file만 읽는 512 KiB bounded structured diff를 local과 SSH에 동일하게
  적용하고 unified/side-by-side, whitespace mode와 binary/truncated state를 구현했다.
- rename display label과 command selector를 분리하고 canonical target path를 exact fileset으로
  전달한다. registry v3 migration은 v2 shell state를 보존하고 legacy projection cache만
  무효화한다.
- conflict와 locally stored remote refs 기준 outgoing/behind를 cache freshness와 분리해
  `Last fetched` 상태로 표시했다.
- `--at-op=@ --ignore-working-copy` 기반 recent operation log와 disabled undo eligibility
  preview를 추가하고 query 전후 operation identity가 유지됨을 검증했다.
- 선택할 때마다 움직이던 recent repository grouping을 stable pinned/local/SSH rail로
  대체하고 working copy, local/remote bookmark, conflict와 operation navigation을 추가했다.
- 하단 작업면을 overview, hierarchical changed-file tree/diff와 operation history tab으로
  정리해 dense change review 흐름을 유지했다.
- overview projection과 화면에 전체 commit message/trailer, author/committer identity와 시각,
  full commit/parent identity를 추가했다. rename은 사람이 읽는 display path를 보이되 diff
  selector에는 canonical target path만 사용한다.
- 20px history row와 압축된 native chrome으로 기본 창 크기에서 20개 이상의 change를
  노출하고, system UI font, 10-12px text floor, stronger foreground contrast와 state 중심
  accent로 rail, history, inspector와 diff의 가독성을 높였다.
- flat repository/inspector tabs, stronger separator/selected hierarchy와 native titlebar
  drag/8방향 resize hit area를 추가했다.
- graph/history와 inspector 경계에 pointer/keyboard splitter를 추가하고 double-click reset과
  양쪽 작업면의 최소 높이를 보존했다. side-by-side diff는 Before/After 독립 pane과 개별 가로
  스크롤을 사용해 긴 줄이 반대쪽 pane을 가리지 않는다. platform overlay 정책과 무관하게
  proportional scrollbar thumb를 항상 표시하고 track click, drag와 keyboard 조작을 지원한다.
- deterministic fixtures, simulated 및 owner-controlled SSH, browser/native smoke와 canonical
  local gate를 통과했다. private identity, source content와 raw evidence는 기록하지 않았다.

## 2026-07-24: P3 Safe Shaping

- 모든 mutation을 opaque single-use preview와 confirmed execute로 분리하고 repository별
  serialization, exact operation/candidate stale recheck와 recovery-required 분류를 추가했다.
- local과 simulated SSH에서 new, edit, full-message describe와 fetch가 같은 typed
  request/result contract를 사용한다.
- isolated fixture에서 rebase, squash, exact file-level split, abandon과 undo를 실행하고 fresh
  projection 및 operation postcondition을 확인했다.
- working copy, root, immutable change와 local/remote bookmark target을 보호하고 preview에
  열거된 unreferenced empty changes만 제거하는 pruning을 구현했다.
- local bookmark move와 explicit typed-confirmation push를 local bare remote fixture로
  검증했으며 force/delete option은 제공하지 않는다.
- graph mouse drag/drop과 `R`/방향키/`Enter` keyboard path를 같은 rebase preview에 연결하고
  packaged desktop shell, deterministic interaction smoke와 canonical local gate를 통과했다.
  private repository identity, path, remote와 raw output은 tracked evidence에 남기지 않았다.
