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
- [x] persistent repository tabs와 quick switcher
- [x] cached status badge와 asynchronous refresh
- [x] local/remote editor 및 terminal open action
- [x] bounded change-history virtualization spike

## P2: Graph And Diff

- [x] multi-lane change DAG와 revision navigation
- [x] file list, 긴 줄을 격리하는 unified와 side-by-side diff
- [x] conflict, outgoing와 behind projection
- [x] operation log와 read-only undo eligibility surface
- [x] reference/conflict navigation과 resizable overview/changes/operations inspector
- [x] working copy file tree/diff 작업면과 changed-file count
- [x] reference-centered history folding과 구간별 progressive reveal/collapse

## P3: Safe Shaping

- [x] new, edit, describe와 fetch
- [x] rebase, squash, split와 abandon
- [x] bookmark move와 push
- [x] operation precondition, preview와 recovery acceptance
- [x] pointer drag/drop, cycle-safe 예상 topology와 keyboard-equivalent shaping preview
- [x] current/other workspace 검토와 exact directory까지 정리하는 one-step removal

## P4: Distribution

- [x] `0.9.0` source version, macOS app/DMG bundle target과 tag-driven prerelease workflow
- [x] Apple Silicon용 ad-hoc-signed/not-notarized beta와 표준 Gatekeeper 최초 실행 정책
- [x] macOS artifact, checksum, clean install/launch/restart와 local/SSH smoke
- [ ] reviewed tag, same-SHA CI와 GitHub prerelease
- [ ] updater contract는 0.9.x 후속 slice에서 별도로 결정
- [ ] optional Developer ID signing/notarization
- [ ] Linux와 Windows acceptance
- [ ] Linux packaging 전에 `RUSTSEC-2024-0429` upstream resolution 또는 validated pinned backport 재검토
- [ ] optional `jjcat-agent` install/upgrade/remove contract
