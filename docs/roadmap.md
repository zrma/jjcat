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

## P3: Safe Shaping

- [x] new, edit, describe와 fetch
- [x] rebase, squash, split와 abandon
- [x] bookmark move와 push
- [x] operation precondition, preview와 recovery acceptance
- [x] pointer drag/drop, cycle-safe 예상 topology와 keyboard-equivalent shaping preview

## P4: Distribution

- [ ] macOS packaging, signing과 update path
- [ ] Linux와 Windows acceptance
- [ ] Linux packaging 전에 `RUSTSEC-2024-0429` upstream resolution 또는 validated pinned backport 재검토
- [ ] optional `jjcat-agent` install/upgrade/remove contract
- [ ] release artifacts와 user documentation
