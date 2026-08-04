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
- `docs/milestones/p2-graph-and-diff/`: 완료된 P2 acceptance와 결정.
- `docs/milestones/p3-safe-shaping/`: 완료된 P3 safety, mutation과 interaction acceptance.
- `scripts/check.sh`: canonical local gate.

## Current Work

현재 active todo는 없다. `docs/milestones/ai-first-adoption/spec.md`에서 제품 기능과
release behavior를 바꾸지 않고 versioned core/profile, repository overlay,
immutable source lock와 standalone drift check 도입을 완료했다.

local/SSH mutation은 opaque single-use preview, repository별 queue, execute 직전 operation과
candidate recheck, fresh projection postcondition을 공유한다. new/edit/describe/fetch,
rebase/squash/file-level split/abandon, protected empty pruning, undo, bookmark move와 confirmed
push가 구현됐다. graph drag/drop과 keyboard shaping은 execute를 우회하지 않고 같은 rebase
preview를 연다. workspace manager는 current/non-empty workspace와 unsafe path를 보호하면서
다른 empty workspace의 working-copy change, registration과 exact directory를 단일
preview-first action으로 정리한다.
완료된 `docs/milestones/ui-state-and-confirmation/spec.md`는 native window와 ratio-based
history/inspector 배치를 restart 뒤 복원하고, rebase drop을 단일 exact preview로 연결한다.
typed confirmation은 제거했으며 `jj op`로 되감을 수 있는 mutation만 `Enter`/`Y` 실행을
허용한다. directory 삭제와 remote push는 exact target이 표시된 pointer click으로만 실행한다.
이 변경은 `v0.9.3` release에 포함된다.
완료된 `docs/milestones/diff-viewer-preferences/spec.md`는 unified/side-by-side와 whitespace
선택을 app-owned preference로 저장하고, 메인 창의 모든 viewer와 별도 diff 창이 같은 값을
양방향 공유하도록 한다. 이 변경은 `v0.9.4` release 대상이다.
완료된 `docs/milestones/diff-readability/spec.md`는 side-by-side pane의 상대 가로 위치를
양방향 동기화하고, unified와 side-by-side 교체 줄을 bounded 단어/문자 단위로 강조한다.
유사도가 낮거나 과도하게 긴 줄은 whole-line styling으로 fallback한다. 이 변경은
`v0.9.5` release에 포함된다.
완료된 `docs/milestones/update-check-cadence/spec.md`는 기존 startup check를 유지하면서 main
window focus가 3초간 이어질 때 background update check를 예약한다. 실제 확인 시도에는
1시간 cooldown을 적용하고 manual check는 언제나 즉시 실행한다. 이 변경은 `v0.9.6`
release에 포함된다.
완료된 `docs/milestones/repository-rail-scroll/spec.md`는 Workspace, Repository와
Last Fetched navigation을 rail 상단에 고정하고 Repository Sources와 Standalone만
독립적으로 스크롤한다. source repository를 연 뒤에도 같은 스크롤 위치를 유지한다.
이 변경은 `v0.9.7` release에 포함된다.
완료된 `docs/milestones/semantic-activity-status/spec.md`는 repository mutation과 겹친
refresh를 failure 대신 waiting activity로 분류하고, 주요 indefinite loading/mutation
surface를 공통 CLI형 spinner로 통일한다. 실제 driver/recovery warning은 그대로 유지하고
Quick Look 실패는 repository refresh health와 분리한다. 이 변경은 `v0.9.8` release에
포함된다.
완료된 `docs/milestones/update-relaunch-activation/spec.md`는 사용자가 명시적으로 선택한
update restart에 one-shot foreground intent를 남기고, 이 기능이 이미 있는 outgoing
version에서 시작하는 후속 update의 새 main window가 이를 소비해 show/focus하도록 했다.
marker가 없는 `v0.9.8 → v0.9.9` 첫 restart는 bootstrap 범위 밖이다.

완료된 `docs/milestones/update-launch-activation-bootstrap/spec.md`는 `v0.9.10` incoming
main window가 marker 없이 스스로 show/focus하고 Quick Look은 제외해 bootstrap version
gap을 제거한다. native bundle smoke, canonical gate와 release verification을 통과했다.

현재 active todo는 `docs/todo-file-context-actions/spec.md`다. Working Copy와 하단 Changes의
file tree가 같은 compact context menu를 사용하고, 우클릭한 파일 선택과 diff/editor/Finder,
single-file split, path copy action을 repository transport 경계에 맞게 제공한다.

완료된 release todo는 `docs/milestones/v0-9-0-release/spec.md`다. `v0.9.0` tag, release commit,
same-SHA CI와 GitHub prerelease가 같은 revision에서 성공했고, 공개된 app archive,
DMG와 checksum manifest를 다시 내려받아 검증했다. 첫 public beta는 Apple Silicon용
ad-hoc-signed/not-notarized prerelease이며 Developer ID 신뢰 체인을 제공하지 않는다.
완료된 `docs/milestones/v0-9-x-updater/spec.md`는 우하단의 available-only update action,
Tauri 서명 검증, versioned updater artifacts, rolling beta manifest와 explicit restart를
구현했다. focused/canonical gate와 ephemeral-key `0.9.0`→`0.9.1` fixture
download/verify/install/relaunch smoke까지 통과했다. persistent password-protected
updater key는 owner-controlled recovery archive에 보관하고 GitHub Actions
secret/variable에 구성했으며, 그 키로 만든 release artifact도 서명 검증을 통과했다.
첫 updater-enabled bootstrap인 `v0.9.1`은 signed tag, same-SHA CI와 Release
workflow에서 게시됐고 공개 DMG 설치 및 rolling manifest 검증도 통과했다. 이어서
`v0.9.2`를 게시하고 설치된 `v0.9.1`의 available-only action에서 공개 updater를
download/verify/install한 뒤 명시적으로 restart해 `v0.9.2` 실행과 no-update 상태까지
검증했다. 유료 Apple Developer Program을 사용하는 Developer ID signing/notarization은
현재 계획된 작업이 아니며, 배포량 또는 지원 비용이 구독을 정당화할 때만 새
distribution decision으로 재검토한다. remote helper도 별도 decision boundary로 남는다.

## Completion Rule

patch 적용이나 compile 성공만으로 완료하지 않는다. acceptance별 focused test, 대표
local/SSH fixture, user-visible desktop smoke와 전체 gate를 현재 slice 위험에 맞게 확인한다.
문서에는 evidence가 증명한 기능만 implemented로 표시한다. push, visibility, package
publish와 release는 별도 결정 경계다. prompt, transcript, memory와 raw tool output은
tracked evidence가 아니다.
