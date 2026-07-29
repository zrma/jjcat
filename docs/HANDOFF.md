# jjcat Handoff

## Start Here

1. `AGENTS.md`와 `docs/agent-harness.md`를 읽는다.
2. `jj status`로 기존 변경을 확인한다.
3. `docs/status.md`, `docs/roadmap.md`와 `docs/ARCHITECTURE.md`를 읽는다.
4. tracked artifact를 바꾸면 `docs/PUBLICATION.md`의 public boundary를 적용한다.
5. 활성 `docs/todo-*/spec.md`와 `open-questions.md`의 acceptance를 우선한다.
6. focused test 뒤 `scripts/check.sh`로 닫는다.

## Current Baseline

- repository는 P3 graph/diff 및 preview-first safe-shaping cockpit과 0.9.0
  Apple Silicon macOS public beta 출고를 완료했다.
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
- `docs/todo-p3-safe-shaping/`: 완료된 P3 safety, mutation과 interaction acceptance.
- `scripts/check.sh`: canonical local gate.

## Current Work

선택된 active todo 없음

local/SSH mutation은 opaque single-use preview, repository별 queue, execute 직전 operation과
candidate recheck, fresh projection postcondition을 공유한다. new/edit/describe/fetch,
rebase/squash/file-level split/abandon, protected empty pruning, undo, bookmark move와 confirmed
push가 구현됐다. graph drag/drop과 keyboard shaping은 execute를 우회하지 않고 같은 rebase
preview를 연다. workspace manager는 current/non-empty workspace와 unsafe path를 보호하면서
다른 empty workspace의 working-copy change, registration과 exact directory를 단일
preview-first action으로 정리한다.

완료된 release todo는 `docs/todo-v0-9-0-release/spec.md`다. `v0.9.0` tag, release commit,
same-SHA CI와 GitHub prerelease가 같은 revision에서 성공했고, 공개된 app archive,
DMG와 checksum manifest를 다시 내려받아 검증했다. 첫 public beta는 Apple Silicon용
ad-hoc-signed/not-notarized prerelease이며 Developer ID 신뢰 체인을 제공하지 않는다.
완료된 `docs/todo-v0-9-x-updater/spec.md`는 우하단의 available-only update action,
Tauri 서명 검증, versioned updater artifacts, rolling beta manifest와 explicit restart를
구현했다. focused/canonical gate와 ephemeral-key `0.9.0`→`0.9.1` fixture
download/verify/install/relaunch smoke까지 통과했다. persistent password-protected
updater key는 owner-controlled recovery archive에 보관하고 GitHub Actions
secret/variable에 구성했으며, 그 키로 만든 release artifact도 서명 검증을 통과했다.
첫 updater-enabled bootstrap인 `v0.9.1`은 signed tag, same-SHA CI와 Release
workflow에서 게시됐고 공개 DMG 설치 및 rolling manifest 검증도 통과했다. 이어서
`v0.9.2`를 게시하고 설치된 `v0.9.1`의 available-only action에서 공개 updater를
download/verify/install한 뒤 명시적으로 restart해 `v0.9.2` 실행과 no-update 상태까지
검증했다. Developer ID distribution과 remote helper는 후속 decision boundary로 남는다.

## Completion Rule

patch 적용이나 compile 성공만으로 완료하지 않는다. acceptance별 focused test, 대표
local/SSH fixture, user-visible desktop smoke와 전체 gate를 현재 slice 위험에 맞게 확인한다.
문서에는 evidence가 증명한 기능만 implemented로 표시한다. push, visibility, package
publish와 release는 별도 결정 경계다. prompt, transcript, memory와 raw tool output은
tracked evidence가 아니다.
