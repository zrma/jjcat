# Completed Milestones

## 2026-08-07: Graph Tag Labels

- local과 SSH가 공유하는 bounded graph/selected-change projection에 revision tag 이름을
  추가하고 tag 없는 기존 projection cache도 계속 읽게 했다.
- history row와 overview에서 bookmark와 구분되는 read-only tag label을 표시하고, tag
  검색과 reference-centered folding anchor를 지원한다.
- focused frontend/Rust test, local/simulated SSH integration, rendered tag/search smoke와
  canonical/publication gate를 통과했다. remote write와 release는 수행하지 않았다.

## 2026-08-07: Transient Handoff Notice

- repository/file handoff와 path copy 성공 feedback을 4초 transient notice로 제한해
  완료된 문구가 workspace 상단에 영구 잔류하지 않게 했다.
- 같은 action을 반복해도 마지막 실행부터 timer를 다시 시작하고, sequence로
  오래된 expiry가 최신 notice를 지우지 못하게 했다.
- focused test, rendered repeated-action/auto-dismiss smoke, canonical/publication gate, signed
  `v0.9.15` same-SHA CI/Release와 fresh public artifact 및 rolling updater 검증을 통과했다.

## 2026-08-05: File Timeline Loading Continuity

- revision refresh 중 기존 text/binary/empty provenance surface를 유지하고 compact activity를
  겹쳐 표시한 뒤 새 projection을 한 번에 교체해 전체 화면 깜빡임을 제거했다.
- window-lifetime bounded LRU, 동일 revision in-flight dedup과 immediate older/newer
  best-effort prefetch로 인접 탐색을 가능한 경우 즉시 전환한다.
- focused test, rendered uncached/cached interaction, canonical/publication gate, signed
  `v0.9.14` same-SHA CI/Release와 fresh public artifact 및 rolling updater 검증을 통과했다.

## 2026-08-05: File Timeline Ruler

- File Blame/Timeline의 균등 index slider를 실제 commit timestamp에 비례하는 연·월 ruler,
  선택 cursor와 commit marker로 교체했다.
- marker hover/focus preview와 direct click navigation을 제공하고, 화면상 가까운 commit은
  responsive cluster와 keyboard-accessible picker로 탐색한다.
- focused frontend test, rendered browser/design QA, canonical/publication gate, signed
  `v0.9.13` same-SHA CI/Release와 fresh public artifact 및 rolling updater 검증을 통과했다.

## 2026-08-05: Revision File Inspection

- 선택 revision의 전체 tracked snapshot을 lazy File Tree로 탐색하고, 선택 파일의 bounded
  source를 binary/truncation 상태와 함께 표시한다.
- Working Copy, Changes와 snapshot tree의 context menu에서 별도 app-owned Blame/Timeline
  창을 열고 file history, grouped line provenance와 older/newer revision 이동을 제공한다.
- local/SSH가 exact revision/path를 사용하는 같은 typed projection과 bounded output contract를
  공유하고 stale path와 malformed output을 안전하게 거부한다.
- focused frontend/Rust/integration test, rendered browser/design QA, canonical/publication gate,
  signed `v0.9.12` same-SHA CI/Release와 fresh public artifact 검증을 통과했다.

## 2026-08-05: File Context Actions

- Working Copy와 Changes inspector의 file tree가 같은 compact context menu를 사용하고,
  우클릭한 file row를 먼저 선택한다.
- pointer와 keyboard menu key/`Shift+F10`에서 diff Quick Look, VS Code, local Finder,
  exact single-file split과 path copy action을 제공한다.
- repository-relative path를 검증해 local/SSH editor와 platform reveal program에 structured
  argv로 전달하고 SSH Finder action은 비활성화한다.
- focused frontend/Rust test, rendered local/SSH interaction, arm64 native bundle smoke와
  canonical/publication gate를 통과했다.

## 2026-08-01: Bootstrap-safe Update Launch Activation

- incoming native app이 main window를 show/focus해 outgoing version의 marker 지원 여부와
  관계없이 update restart와 일반 GUI launch에서 macOS 전면 app으로 복귀한다.
- 별도 diff Quick Look은 activation target에서 제외하고 `v0.9.9` legacy marker는 main
  frontend startup에서 안전하게 제거한다.
- focused frontend test, native arm64 bundle frontmost smoke, canonical/publication gate와
  `v0.9.10` release 검증을 통과했다.

## 2026-07-31: Foreground Update Relaunch

- 사용자가 **Restart to update**를 선택할 때만 짧은 수명의 one-shot foreground intent를
  기록하고 새 main window에서 한 번 소비하도록 했다.
- 이 기능이 이미 있는 outgoing version에서 시작하는 후속 update의 새 window는 기존 size,
  position과 maximized state를 복원한 뒤 show/focus된다. marker가 없는
  `v0.9.8 → v0.9.9` 첫 restart는 bootstrap 적용 범위 밖임을 후속 문서 정정으로 명시했다.
- restart failure, missing/stale/invalid intent를 안전하게 제거하는 focused test, production
  build, canonical/publication gate와 `v0.9.9` release 검증을 통과했다.

## 2026-07-31: Semantic Activity and Warning States

- active repository mutation과 겹친 refresh를 notice와 Command Activity 모두에서 warning
  대신 `Waiting to refresh`로 표시하고 cache와 retry 시점을 계속 보여준다.
- 초기 repository load, diff/operation load, source scan, remote folder 탐색, repository
  추가, mutation preview/execute와 Undo/Redo에 공통 CLI형 spinner를 적용했다.
- 실제 SSH/driver 실패와 recovery warning은 경고 의미를 유지하고, Quick Look 오류가
  repository health를 failed/disconnected로 오염시키지 않도록 분리했다.
- focused status/notice test, production frontend build, rendered running/completed/failure
  semantic smoke, canonical repository gate와 `v0.9.8` release 검증을 통과했다.

## 2026-07-31: Stable Repository Rail Scrolling

- Workspace, Repository와 Last Fetched navigation을 repository rail 상단에 고정하고
  Repository Sources와 Standalone 목록만 독립적으로 스크롤하도록 분리했다.
- source title은 목록 안에서 sticky하게 유지하고 overscroll 및 scroll anchoring 경계를
  제한해 큰 source tree에서도 주변 app shell과 시각적 위치가 흔들리지 않게 했다.
- source tree를 스크롤한 상태에서 repository를 pointer로 double-click해 열어도 scroll
  position과 상단 navigation 좌표가 유지되는 것을 production browser smoke로 확인했다.
- focused frontend test/build와 canonical repository gate를 통과했다.

## 2026-07-31: Synchronized and Intraline Diff Reading

- side-by-side Before/After의 독립 overflow 경계는 유지하면서 어느 pane의 native 또는
  custom scrollbar를 조작해도 양쪽 상대 가로 위치가 함께 이동하도록 연결했다.
- 인접한 deletion/addition 교체 줄을 단어 단위로 비교하고 충분히 유사한 단어는 문자
  단위로 세분화해 unified와 side-by-side 양쪽에서 실제 변경 구간만 더 강하게 강조한다.
- 유사도가 낮거나 과도하게 긴 줄은 bounded 계산을 넘기지 않고 기존 whole-line
  styling으로 fallback한다.
- focused unit test, production frontend build와 browser keyboard interaction smoke에서
  양쪽 pane의 동일한 scroll progress와 intraline 강조를 확인했다.

## 2026-07-31: Persistent Shared Diff Viewer Preferences

- unified/side-by-side와 whitespace 선택을 app-owned local preference로 저장하고 메인
  창의 모든 diff surface에서 공유한다.
- 별도 diff window는 현재 선택을 이어받고, 그 창에서 바꾼 값도 메인 창에 즉시 반영해
  이후 quit/relaunch와 updater restart에 복원한다.
- valid/invalid/storage-failure 및 cross-window payload 회귀 테스트, production frontend
  build, canonical repository gate와 메인/별도 창 양방향 browser smoke를 통과했다.
- `v0.9.4` native app/DMG package의 ad-hoc code seal, app version, arm64 architecture와
  disk image checksum을 확인했다.

## 2026-07-30: Persistent UI State and Single-confirm Mutations

- main window의 size, position과 maximized state를 app-owned local data로 복원하고
  history/inspector splitter는 window 크기에 적응하는 versioned ratio로 저장한다.
- pointer rebase의 hover topology는 유지하면서 drop 뒤 inline checkpoint를 제거하고
  backend exact preview를 즉시 열어 실행 확인을 한 번으로 줄였다.
- typed confirmation UI와 IPC field를 제거했다. `jj op`로 되감을 수 있는 mutation만
  `Enter`/`Y` 실행을 제공하고 workspace directory 삭제와 remote push는 exact target이
  표시된 pointer click으로만 실행한다.
- focused frontend/Rust tests, isolated native restart/interaction smoke와 canonical
  repository gate를 통과했다. 실제 repository mutation과 remote write는 수행하지 않았다.

## 2026-07-30: v0.9.x macOS In-App Updater

- 우하단에 available-only `jjcat <version>` action과 bounded progress,
  signature-verified install, explicit restart 및 메뉴의 manual check를 추가했다.
- password-protected persistent updater key의 owner-controlled recovery와 GitHub
  Actions secret/variable을 구성하고, versioned updater assets 뒤 rolling beta
  manifest를 교체하는 release pipeline을 검증했다.
- 첫 updater-enabled `v0.9.1` bootstrap을 공개 DMG로 설치한 뒤 `v0.9.2`를 게시했다.
  설치된 `v0.9.1`은 공개 updater를 download/verify/install하고 사용자의 명시적 restart
  뒤 registry를 보존한 채 `v0.9.2`로 실행됐다.
- signed tags, same-SHA CI와 Release workflows, fresh public asset verification,
  same-version no-update 상태와 canonical/publication gates를 확인했다. 유료 Apple
  Developer Program을 사용하는 Developer ID signing/notarization은 현재 계획하지
  않으며, 배포량 또는 지원 비용이 구독을 정당화할 때만 재검토하기로 결정했다.

## 2026-07-29: P4 Distribution

- Apple Silicon Mac과 macOS 13 이상을 대상으로 하는 `v0.9.0` public beta를
  ad-hoc-signed/not-notarized GitHub prerelease로 게시했다.
- app archive, DMG와 `SHA256SUMS`만 게시하고, release workflow와 fresh download에서
  architecture, minimum system version, sealed signature와 checksum을 검증했다.
- clean install/launch/restart, local/simulated SSH와 대표 actual SSH smoke, repository 및
  public publication boundary gate를 통과했다.
- GPG-signed tag, release commit, terminal CI와 release workflow가 같은 revision을
  가리키는지 확인했다.

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
- 모든 active workspace working copy, root, immutable change와 local/remote bookmark
  target을 보호하고 preview에 열거된 unreferenced empty changes만 제거하는 pruning을
  구현했다.
- local bookmark move와 explicit typed-confirmation push를 local bare remote fixture로
  검증했으며 force/delete option은 제공하지 않는다.
- graph mouse drag/drop과 `R`/방향키/`Enter` keyboard path를 같은 rebase preview에 연결하고
  packaged desktop shell, deterministic interaction smoke와 canonical local gate를 통과했다.
  private repository identity, path, remote와 raw output은 tracked evidence에 남기지 않았다.

## 2026-07-24: Contextual Mutation UX

- 범용 `Actions` button과 native action selector를 제거하고 selected change 옆의 `Change`
  menu와 graph row context menu로 change-level mutation을 이동했다.
- protected empty-change pruning을 repository navigation과 repository row context menu에
  노출하고 narrow window에는 compact fallback을 제공했다.
- mutation dialog는 이미 선택된 intent의 parameter와 exact-target preview에 집중한다.
- local abandon/prune/undo의 중복 typed confirmation을 제거하고 exact-target preview와
  explicit action button을 확인 경계로 유지했다. remote push의 typed confirmation은 보존한다.
  pruning은 열거된 candidate count를 destructive button에 표시하고 별도 phrase 입력을
  요구하지 않으며, remote push 등의 typed confirmation과 stale-operation safety contract는
  유지한다.
- Tauri mutation intent의 variant 내부 field까지 camelCase로 직렬화하고 전체 intent JSON
  round trip을 검사해 rebase를 포함한 frontend/native IPC 계약을 고정했다.
- desktop/narrow rendered interaction, focused frontend tests와 canonical repository gate를
  통과했다. private repository identity, path, remote와 raw output은 기록하지 않았다.

## 2026-07-24: Rebase Topology Preview

- pointer drag hover 중 source parent를 current destination으로 바꾼 client-side 예상 DAG를
  계산해 실제 mutation 전에 graph 연결 변화를 보여준다.
- 아래쪽 source를 위쪽 destination으로 옮기는 경우 제안 change를 stable topological
  order로 재배치하고, source/descendants/destination만 비교 대상으로 제한해 무관한
  fold 구간에 proposed lane이 남지 않게 했다.
- source descendant를 destination으로 선택하는 cycle을 거부하고 viewport edge drag의
  bounded auto-scroll을 추가했다.
- drop은 실행하지 않고 `Moving`, `New parent`, `Cancel`, `Review rebase`가 있는 inline
  checkpoint에 머문다. review 뒤에만 기존 backend exact-target preview로 전환한다.
- deterministic topology tests, rendered Cancel/Review interaction과 canonical repository
  gate를 통과했다. 실제 repository mutation과 private context는 evidence에 포함하지 않았다.

## 2026-07-25: Workspace Review and Cleanup

- repository에 등록된 모든 workspace의 working-copy change, path와
  changed-file/conflict/empty state를 전용 화면에 모았다.
- current/non-empty workspace는 제거할 수 없게 보호하고 다른 empty workspace는 exact
  name/path/working-copy change를 preview한 뒤 change, registration과 directory를 한 번에
  정리한다.
- local/simulated SSH에서 untracked file이 든 workspace directory까지 삭제되는 integration
  test, 설명이 있는 empty working-copy change의 잔존 회귀 test와
  current/non-empty/root/ancestor/symlink 안전 경계를 추가했다.

## 2026-07-25: Reference-centered History Folding

- local/remote bookmark 전용 sidebar filter를 제거하고 bookmark label, search와 mutation은
  graph 안에 유지했다.
- working copy, workspace copy, local/remote bookmark와 conflict 주변은 바로 보이고
  기준점에서 먼 연속 구간은 `~` row로 접는 deterministic display projection을 추가했다.
- 각 접힌 구간은 10개씩, 전체를 펼치거나 다시 접을 수 있으며 search와 selection은
  원본 bounded history를 유지한다. rebase preview는 source/destination을 임시 anchor로
  노출하고 제안 topology만 별도 stable order로 계산한다.
- workspace inventory에서 fallible root metadata를 분리하고 exact-name best-effort lookup을
  추가해 path가 유실된 legacy registration도 전체 refresh를 막지 않게 했다.

## 2026-07-26: Local and SSH Repository Sources

- direct single-repository add를 유지하면서 local 또는 OpenSSH folder를 source로 등록하고
  bounded depth에서 Jujutsu repository를 찾는 discovery contract를 추가했다.
- source별 collapsible folder/repository tree, deterministic ordering, rescan과
  double-click/`Enter` persistent-tab open을 repository rail과 quick switcher에 연결했다.
- local discovery는 symlink, hidden/generated directory와 repository 내부를 다시 탐색하지
  않고, SSH discovery는 source별 한 session의 NUL-safe path stream과 기존 timeout/output
  boundary를 사용한다.
- registry schema v4와 v3 migration, source/catalog validation, local 및 simulated SSH
  discovery test를 추가했다. source 제거는 catalog만 정리하고 repository, open tab과
  filesystem content를 보존한다.
