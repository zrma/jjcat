# jjcat Handoff

## Start Here

1. `AGENTS.md`와 `docs/agent-harness.md`를 읽는다.
2. `jj status`로 기존 변경을 확인한다.
3. `docs/status.md`, `docs/roadmap.md`와 `docs/ARCHITECTURE.md`를 읽는다.
4. tracked artifact를 바꾸면 `docs/PUBLICATION.md`의 public boundary를 적용한다.
5. 활성 `docs/todo-*/spec.md`와 `open-questions.md`의 acceptance를 우선한다.
6. focused test 뒤 `scripts/check.sh`로 닫는다.

## Current Baseline

- repository는 실행 가능한 pre-alpha P0 read-only cockpit과 AI-first harness를 가진다.
- runtime은 Tauri 2, Rust 2024 core와 React/TypeScript/Vite frontend다.
- local과 SSH transport는 같은 Repository Driver contract를 사용한다.
- SSH는 OpenSSH stdio와 외부 credential ownership을 기본으로 한다.
- publication class는 public이며 모든 tracked artifact는 remote visibility와 무관하게
  `public-ready`로 유지한다.
- remote origin은 아직 없고 license도 선택하지 않았다.

## Architecture Map

- `docs/PRODUCT.md`: target user, jobs, MVP와 non-goals.
- `docs/ARCHITECTURE.md`: component, transport와 security boundary.
- `docs/status.md`: implemented와 planned의 현재 경계.
- `docs/roadmap.md`: milestone 순서.
- `docs/PUBLICATION.md`: 공개 가능 기록과 최초 publish gate.
- `docs/todo-p1-multi-repository-cockpit/`: 현재 acceptance와 open questions.
- `scripts/check.sh`: canonical local gate.

## Current Work

`P1: Multi-repository Cockpit`

P0에서 검증한 registry, cache와 local/SSH projection contract 위에 persistent open tabs,
quick switcher와 background refresh를 추가한다. mutation과 remote helper는 계속 범위 밖이다.

## Completion Rule

patch 적용이나 compile 성공만으로 완료하지 않는다. acceptance별 focused test, 대표
local/SSH fixture, user-visible desktop smoke와 전체 gate를 현재 slice 위험에 맞게 확인한다.
문서에는 evidence가 증명한 기능만 implemented로 표시한다. push, visibility, license와
release는 별도 결정 경계다. prompt, transcript, memory와 raw tool output은 tracked
evidence가 아니다.
