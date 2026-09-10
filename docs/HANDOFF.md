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
- `docs/completed-milestones.md`: 완료된 acceptance와 당시 검증 범위.
- `docs/releases/`: version별 배포 계약과 알려진 제한.
- `scripts/check.sh`: canonical local gate.

## Current Work

현재 active todo는 없다. `v0.9.18` Apple Silicon macOS beta와 signed updater의 same-SHA
CI/Release, fresh public assets 및 rolling manifest 검증을 완료했다. 현재 기능은
`docs/status.md`, runtime·mutation·transport 안전 계약은 `docs/ARCHITECTURE.md`를 따른다.

외부 변경 갱신 수정은 local/SSH snapshot regression, browser의 Refresh·tab 전환·재선택
smoke와 전체 local gate를 통과했다. 계약은 `docs/ARCHITECTURE.md`의 Repository Refresh가
소유한다. `v0.9.18` 공개 산출물의 checksum, Minisign, ZIP/tar/DMG 내부 app 서명과
rolling updater manifest 일치도 확인했다. native updater로 설치한 새 app의 version과
공개 실행 파일 일치 및 Fetch 없는 외부 문서 변경 반영을 확인했다.

완료 spec과 resolved 질문의 결과는 `docs/completed-milestones.md`, architecture와
`docs/releases/`로 이관했다. 완료 기록은 해당 시점의 evidence이며 후속 변경으로 대체된
확인 UI나 activation 방식을 현재 계약으로 적용하지 않는다. 특히 typed confirmation과
rebase inline checkpoint는 제거됐고, main-window activation은 incoming binary가 소유한다.

다음 trigger는 `docs/roadmap.md`의 distribution acceptance와 `SECURITY.md`의 upstream
constraint다. remote helper, 다른 OS, 유료 Developer ID signing/notarization은 별도 decision
boundary다. 유료 Apple Developer Program을 사용하는 Developer ID signing/notarization은
현재 계획된 작업이 아니며 배포량 또는 지원 비용이 구독을 정당화할 때 다시 검토한다.
새 bounded slice를 선택하면 목적과 acceptance를 갖춘 spec을 연다.

## Completion Rule

patch 적용이나 compile 성공만으로 완료하지 않는다. acceptance별 focused test, 대표
local/SSH fixture, user-visible desktop smoke와 전체 gate를 현재 slice 위험에 맞게 확인한다.
문서에는 evidence가 증명한 기능만 implemented로 표시한다. push, visibility, package
publish와 release는 별도 결정 경계다. prompt, transcript, memory와 raw tool output은
tracked evidence가 아니다.
