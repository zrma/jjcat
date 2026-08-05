# Project Status

## Current Milestone

`P3: Safe Shaping`과 `P4: Distribution`까지 완료됐다. preview-first safe shaping을
포함한 local/SSH cockpit과 Apple Silicon macOS용 `v0.9.0` public beta가 게시됐다.
updater가 없는 `v0.9.0` 이후의 manual bootstrap과 그 다음 버전부터의 signed in-app
update path도 완료됐다. password-protected persistent updater key recovery와 GitHub
Actions secret/variable configuration, signed `v0.9.1` bootstrap, rolling beta
manifest와 `v0.9.2` prerelease를 게시했다. 설치된 `v0.9.1`은 공개 updater를
download/verify/install하고 사용자의 명시적 restart 뒤 `v0.9.2`로 실행됐다. 현재
`v0.9.3`은 restart-persistent window/splitter 배치와 단일-confirm mutation UX를
배포했다. `v0.9.4`는 모든 diff viewer의 layout/whitespace 선택을 앱 재시작과 update
restart 뒤에도 복원하고 메인/별도 창 사이에서 공유한다. `v0.9.5`는 side-by-side
Before/After의 상대 가로 위치를 동기화하고 unified와 side-by-side에서 교체 줄의
단어/문자 단위 변경 구간을 강조한다. `v0.9.6`은 main window focus가 3초간 이어질 때
1시간 cooldown의 background update check를 실행하고 manual check는 즉시 실행한다.
`v0.9.7`은 repository rail의 상단 탐색을 고정하고 source tree만 독립적으로 스크롤하며,
source repository를 연 뒤에도 그 스크롤 위치를 유지한다.
`v0.9.8`은 repository mutation 때문에 대기하는 refresh를 실패 경고가 아닌 activity로
표시하고, 주요 indefinite 작업에 공통 CLI형 spinner를 사용한다.
`v0.9.9`는 사용자가 선택한 update restart에 후속 process용 foreground intent를 기록한다.
다만 marker 기능이 없는 `v0.9.8 → v0.9.9` 첫 restart에는 적용되지 않는다.
`v0.9.10` Apple Silicon macOS beta는 incoming main window가 marker 없이 스스로
show/focus하도록 해 이 bootstrap gap을 제거한다. `v0.9.11` Apple Silicon macOS beta는
Working Copy와 Changes file tree에 compact context action menu, exact single-file split과
transport-aware editor/Finder handoff를 추가한다. 현재 active milestone은
`docs/todo-revision-file-inspection/spec.md`이며 File Tree/Blame 구현과 canonical gate를
완료하고 `v0.9.12` publication verification을 남겨두고 있다.
`v0.9.12` Apple Silicon macOS beta는 이 active milestone의 release target이다.

완료된 기반:

- 제품명 `jjcat`과 tagline
- stable application identifier `com.1day1coding.jjcat`
- local/SSH multi-repository product contract
- driver, registry, cache, operation safety contract와 SSH trust boundary
- pinned core와 repository overlay를 합성하는 canonical `ai-first-harness-v1` 구조
- repository contract와 publication boundary local gate
- `docs/todo-*` 기반 자율 작업 bootstrap
- colocated Jujutsu/Git repository
- Tauri 2 + Rust 2024 + React/TypeScript/Vite desktop runtime
- stable local/SSH repository identity와 schema-versioned JSON registry
- schema v4의 local/SSH repository source, bounded discovery catalog과 v3→v4 migration
- source별 collapsible folder/repository tree, rescan과 double-click/`Enter` tab open
- 고정된 repository navigation과 독립 source tree scroll, repository open 뒤 scroll 위치 보존
- direct single-repository add와 source catalog removal의 filesystem-safe 분리
- `jj` capability, machine-readable status/log/file projection
- bounded timeout/cancellation과 redacted error를 갖춘 OpenSSH stdio driver
- repository rail, tabs, DAG, change inspector와 cached/stale/disconnected UI
- 20px dense graph/history row, readable system typography와 high-contrast visual hierarchy
- flat native-style tabs와 separators, selected-row hierarchy, draggable/resizable desktop shell
- 전체 commit message/trailer, author/committer, full commit/parent identity를 보여주는 overview
- 최대 200개/1 MiB graph projection과 분리된 4 MiB selected-change metadata/file detail 조회
- overview와 file-tree/diff를 위아래로 합친 하단 changes inspector, 별도 operations
  inspector와 change metadata search/filter
- pointer/keyboard로 높이를 조절하고 double-click으로 초기화하는 history/inspector splitter
- 통합 Add dialog의 native local picker, OpenSSH alias/dropdown 및 bounded remote folder browser
- VisualJJ 방식의 local/remote inline bookmark label, source identity와 overflow
- filesystem을 건드리지 않는 registry/cache/tab 전용 repository remove
- local absolute path 및 `~/...` 입력의 canonical identity normalization
- cat outline과 change DAG를 결합한 header/application identity asset
- local, simulated SSH, local-only actual SSH 2-repository matrix와 native bundle smoke
- v1→v2 persistent tab recovery와 legacy diff cache만 무효화하는 v2→v3 migration
- keyboard/pointer quick switcher search, close/reopen과 persistent tab reorder
- stable pinned/local/SSH repository grouping과 compact freshness/error state
- working copy, workspace, conflict, operation과 last-fetched repository navigation
- working copy, local/remote bookmark, conflict와 workspace 기준점을 중심으로 오래된
  선형 구간을 접고 구간별로 10개씩 또는 전체를 펼치는 reference-centered graph
- graph filter와 분리된 working copy file tree/diff 작업면과 실제 changed-file count
- 등록된 모든 current/other workspace의 path, working-copy change와
  changed-file/conflict/empty state를 검토하는 전용 workspace 관리 화면
- workspace path metadata가 유실된 legacy registration도 전체 refresh를 막지 않는
  core inventory와 best-effort path lookup 분리
- current/non-empty workspace와 unsafe path를 보호하고 exact empty working-copy change,
  registered directory와 registration을 함께 정리하는 local/SSH workspace removal
  preview/execute
- repository별 refresh dedup/cancel, active/inactive interval과 bounded failure backoff
- `busy` refresh의 waiting 상태, 주요 indefinite 작업의 공통 activity spinner와 실제
  driver/recovery warning을 분리하는 semantic progress feedback
- structured argv를 사용하는 local/SSH VS Code 및 platform terminal handoff
- 40개 이상 history의 bounded row virtualization과 representative interaction fixture
- stable multi-lane change topology와 pointer/keyboard revision navigation
- selected revision/file만 읽는 512 KiB bounded local/SSH structured diff
- rename display path와 target canonical path를 분리하고 escaped exact fileset을 사용하는
  local/SSH diff selection
- 긴 줄에서도 같은 폭의 overflow pane과 항상 보이는 scrollbar를 유지하고 양쪽의 상대
  가로 위치를 동기화하는 unified/side-by-side renderer
- 인접한 교체 줄을 bounded 단어/문자 단위로 강조하고 유사도가 낮거나 과도하게 긴 줄은
  whole-line styling으로 fallback하는 intraline diff
- cache freshness와 분리된 conflict 및 last-fetched outgoing/behind 상태
- operation identity를 변경하지 않는 recent operation log, 상단의 명확한 Undo/Redo button과
  input-safe platform shortcut
- opaque single-use preview token, repository별 mutation serialization, execute 직전
  operation/candidate stale recheck와 실패 뒤 recovery-required 분류
- local/SSH `new`, `edit`, full-message `describe`와 explicit network `fetch`
- `rebase`, complete `squash`, exact file-level `split`, exact-target `abandon`
- 모든 active workspace working copy, root, immutable change와 local/remote bookmark
  target을 보존하는 enumerated empty-change pruning
- current/other workspace working copy를 구분하는 graph badge와 semantic node color
- exact current operation을 고정하고 별도 confirmation dialog 없이 `jj` operation history를
  여러 step 왕복하는 direct `undo`/`redo`, local bookmark move와 exact-target pointer-only remote push
- `jj undo`로 복원 가능한 local mutation preview의 `Enter`/`Y` 실행과 `Esc`/`N` 취소;
  directory를 삭제하는 workspace removal과 remote push는 typed input이나 실행 shortcut 없이
  명시적 pointer click만 사용
- graph mouse drag/drop과 `R`/방향키/`Enter` keyboard path가 공유하는 rebase preview
- local bookmark label drag/drop이 여는 exact-target bookmark move preview
- pointer drag 중 cycle-safe 예상 DAG와 source/new-parent label, drop 뒤 즉시 여는 단일
  exact rebase preview
- 아래쪽 branch를 위쪽 parent로 옮길 때도 제안 change를 stable topological order로
  재배치하고 source/descendants/new-parent에만 blue comparison을 적용하는 folded preview
- fresh projection/operation log 기반 action postcondition과 cache refresh
- selected change 가까이의 `Change` 메뉴와 graph row context menu로 제공하는
  edit/describe/history shaping/bookmark 작업
- Working Copy와 Changes file tree가 공유하는 pointer/keyboard context menu, exact
  single-file split 및 transport-aware editor/Finder handoff
- repository navigation과 repository row context menu에 노출된 protected empty-change
  pruning, rail이 접히는 narrow window의 compact fallback
- action 선택 단계를 제거하고 선택한 작업의 parameter와 exact-target preview에 집중하는
  mutation dialog
- available 상태에서만 우하단에 나타나는 `jjcat <version>` download action, 메뉴의
  manual check, bounded progress와 explicit restart
- Tauri Minisign archive, 두 macOS platform alias의 `latest-beta.json`, versioned asset 뒤
  rolling beta manifest를 교체하는 release pipeline
- known signature/tamper test와 updater-enabled 두 fixture 사이의
  download/verify/install/relaunch local smoke
- 공개 `v0.9.1` bootstrap에서 `v0.9.2`로 이어지는 available-only
  download/verify/install/explicit-restart live update
- startup check를 유지하면서 main window focus 3초 뒤 1시간 cooldown으로 실행되는
  background update check와 cooldown을 우회하는 manual check
- quit/relaunch와 updater restart 뒤 native window size/position/maximized state 및
  ratio-based history/inspector splitter 배치 복원
- `v0.9.9` outgoing updater restart의 one-shot foreground intent와 bootstrap 적용 경계
- marker 없는 이전 version에서 시작해도 incoming main window가 직접 show/focus하는
  `v0.9.10` activation target
- unified/side-by-side와 whitespace 선택을 메인 창의 모든 diff viewer 및 별도 diff
  창이 양방향 공유하고 quit/relaunch와 updater restart 뒤 복원
- 중간 inline rebase checkpoint와 모든 typed confirmation을 제거하고 recoverable
  `Enter`/`Y` 대 irreversible pointer-only execution으로 정리한 단일 preview 확인 정책

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

## Latest Release

`v0.9.11` Apple Silicon macOS beta는 ad-hoc-signed/not-notarized prerelease로, Changes와
Working Copy에서 선택한 파일 가까이에 compact context action menu를 제공한다. local/SSH
editor handoff, local Finder reveal, exact single-file split과 path copy를 지원하고 SSH에서는
Finder action을 비활성화한다. `v0.9.10`의 bootstrap-safe foreground activation과 기존
activity/warning 의미, repository rail scroll, diff 가독성, layout/whitespace 선택 및 창
배치는 그대로 유지된다.
유료 Apple Developer Program을 사용하는 Developer ID signing/notarization은 현재
계획된 작업이 아니며, 배포량 또는 지원 비용이 구독을 정당화할 때만 새 decision으로
재검토한다. Linux package 작업 전에는 accepted GTK advisory의 upstream resolution
또는 검증된 backport를 다시 판단한다.
