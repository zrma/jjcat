# jjcat Handoff

## Start Here

1. `AGENTS.md`와 `docs/agent-harness.md`를 읽는다.
2. `jj status`로 기존 변경을 확인한다.
3. `docs/status.md`, `docs/roadmap.md`와 `docs/ARCHITECTURE.md`를 읽는다.
4. tracked artifact를 바꾸면 `docs/PUBLICATION.md`의 public boundary를 적용한다.
5. 활성 `docs/todo-*/spec.md`와 `open-questions.md`의 acceptance를 우선한다.
6. focused test 뒤 `scripts/check.sh`로 닫는다.

## Current Baseline

- repository는 실행 가능한 pre-alpha P2 graph/diff cockpit과 AI-first harness를 가진다.
- runtime은 Tauri 2, Rust 2024 core와 React/TypeScript/Vite frontend다.
- local과 SSH transport는 같은 Repository Driver contract를 사용한다.
- SSH는 OpenSSH stdio와 외부 credential ownership을 기본으로 한다.
- publication class는 public이며 모든 tracked artifact는 remote visibility와 무관하게
  `public-ready`로 유지한다.
- GitHub origin은 public으로 구성했으며 source code는 Apache License 2.0으로 제공한다.
- Linux/BSD Tauri/Wry GTK chain의 `RUSTSEC-2024-0429`는 해결되지 않은 accepted
  upstream constraint다. dependency refresh 또는 Linux distribution 전에
  `SECURITY.md`와 P4 roadmap의 종료 조건을 재검토한다.

## Architecture Map

- `docs/PRODUCT.md`: target user, jobs, MVP와 non-goals.
- `docs/ARCHITECTURE.md`: component, transport와 security boundary.
- `docs/status.md`: implemented와 planned의 현재 경계.
- `docs/roadmap.md`: milestone 순서.
- `docs/PUBLICATION.md`: 공개 가능 기록과 최초 publish gate.
- `docs/todo-p2-graph-and-diff/`: 완료된 P2 acceptance와 결정.
- `scripts/check.sh`: canonical local gate.

## Current Work

`P2: Graph and Diff` completed

multi-lane graph navigation, bounded local/SSH diff, last-fetched divergence와 read-only operation
preview가 구현됐다. 다음 milestone은 P3 safe shaping이지만 mutation precondition과 recovery
acceptance를 먼저 고정하기 전에는 command를 열지 않는다. remote helper는 계속 범위 밖이다.

## Completion Rule

patch 적용이나 compile 성공만으로 완료하지 않는다. acceptance별 focused test, 대표
local/SSH fixture, user-visible desktop smoke와 전체 gate를 현재 slice 위험에 맞게 확인한다.
문서에는 evidence가 증명한 기능만 implemented로 표시한다. push, visibility, package
publish와 release는 별도 결정 경계다. prompt, transcript, memory와 raw tool output은
tracked evidence가 아니다.
