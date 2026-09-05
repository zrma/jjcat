# Product Roadmap

## P0: Read-only Repository Cockpit Foundation

- [x] 제품 identity와 MVP/non-goal 계약
- [x] local/SSH architecture 및 security boundary
- [x] AI-first repository harness와 local gates
- [x] repository registry와 local/SSH location domain model
- [x] `jj` capability, status와 log projection spike
- [x] cancellable SSH stdio executor와 fixture-backed test
- [x] desktop shell과 frontend stack decision
- [x] 최소 desktop shell에서 repository tab 전환 smoke

## P1: Multi-repository Cockpit

- [x] compact graph/history baseline, bottom inspector와 local `~/...` registration
- [x] stable pinned/local/SSH repository sidebar와 last-opened metadata
- [x] local/SSH folder source discovery와 collapsible repository tree
- [x] 고정된 repository navigation과 독립 source tree scroll 및 open 뒤 위치 보존
- [x] persistent repository tabs와 quick switcher
- [x] cached status badge와 asynchronous refresh
- [x] waiting activity와 실제 failure warning을 분리하는 semantic progress feedback
- [x] local/remote editor 및 terminal open action
- [x] bounded change-history virtualization spike

## P2: Graph And Diff

- [x] multi-lane change DAG와 revision navigation
- [x] file list, 긴 줄을 격리하는 unified와 side-by-side diff
- [x] side-by-side 상대 가로 위치 동기화와 bounded 단어/문자 단위 intraline 강조
- [x] conflict, outgoing와 behind projection
- [x] operation log와 read-only undo eligibility surface
- [x] reference/conflict navigation과 resizable overview/changes/operations inspector
- [x] working copy file tree/diff 작업면과 changed-file count
- [x] reference-centered history folding과 구간별 progressive reveal/collapse
- [x] local/SSH revision tag projection, graph/overview read-only label, 검색과 folding anchor

## P3: Safe Shaping

- [x] new, edit, describe와 fetch
- [x] rebase, squash, split와 abandon
- [x] bookmark move와 push
- [x] operation precondition, preview와 recovery acceptance
- [x] pointer drag/drop, cycle-safe 예상 topology와 keyboard-equivalent shaping preview
- [x] current/other workspace 검토와 exact directory까지 정리하는 one-step removal
- [x] restart-persistent window/splitter 배치와 recoverable/irreversible 단일 preview 확인 정책
- [x] 메인/별도 창이 공유하는 restart-persistent diff layout/whitespace preference

## P4: Distribution

- [x] `0.9.0` source version, macOS app/DMG bundle target과 tag-driven prerelease workflow
- [x] Apple Silicon용 ad-hoc-signed/not-notarized beta와 표준 Gatekeeper 최초 실행 정책
- [x] macOS artifact, checksum, clean install/launch/restart와 local/SSH smoke
- [x] reviewed tag, same-SHA CI와 GitHub prerelease
- [x] 0.9.x updater runtime, available-only status-bar action, signed artifact pipeline과
  ephemeral-key two-version smoke
- [x] password-protected persistent updater key recovery와 GitHub Actions
  secret/variable configuration
- [x] rolling beta channel을 활성화한 `v0.9.1` manual bootstrap
- [x] `v0.9.2`의 live in-app update
- [x] main window focus 3초 뒤 1시간 cooldown으로 실행되는 background update check
- [x] outgoing update restart의 one-shot foreground intent와 후속 version activation
- [x] incoming main window가 직접 소유하는 bootstrap-safe foreground activation
- [x] Working Copy와 Changes file tree의 compact context action menu
- [x] 선택 revision의 전체 File Tree/source와 file-level Blame/Timeline
- [x] 실제 시간 비례 연·월 눈금, commit marker와 preview/click navigation을 갖춘 file timeline
- [x] file timeline revision 전환 중 provenance를 유지하는 비차단 loading feedback과
  immediate neighbor prefetch
- [x] repository/file handoff와 path copy 성공 feedback의 bounded transient lifecycle
- [x] Graph revision tag label의 `v0.9.16` Apple Silicon beta와 signed updater 배포
- [x] status bar의 임의 secondary repository shortcut을 제거하고 명시적인 tab/navigation/
  quick switcher로 전환 surface 일원화 및 `v0.9.17` 배포
- Deferred, not planned: 유료 Apple Developer Program을 사용하는 Developer ID
  signing/notarization은 배포량 또는 지원 비용이 구독을 정당화할 때만 새 decision으로
  재검토한다.
- [ ] Linux와 Windows acceptance
- [ ] Linux packaging 전에 `RUSTSEC-2024-0429` upstream resolution 또는 validated pinned backport 재검토
- [ ] optional `jjcat-agent` install/upgrade/remove contract

완료 항목의 검증 범위는 `docs/completed-milestones.md`, 현재 구현 계약은
`docs/ARCHITECTURE.md`, version별 배포 경계는 `docs/releases/`가 소유한다.
현재 active spec은 없다. 위 미완료 후보 중 다음 범위를 선택할 때 새 spec을 연다.
