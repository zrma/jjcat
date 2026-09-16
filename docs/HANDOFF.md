# jjcat Handoff

## Start Here

적용되는 agent 지침과 권한·공개 경계는 항상 준수한다. 아래 순서는 변경·작업 재개를
위한 안내다. 설명·조사·리뷰·계획은 관련 자료와 필요한 재현·검증부터 확인하며, 시작
안내만을 이유로 전체 검사를 실행하지 않는다. 변경 작업의 필수 local gate는 유지한다.

1. `AGENTS.md`와 `docs/agent-harness.md`를 읽는다.
2. `jj status`로 기존 변경을 확인한다.
3. 현재 상태는 `docs/status.md`, 우선순위 판단은 `docs/roadmap.md`, 구조 변경은 `docs/ARCHITECTURE.md`에서 확인한다.
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

현재 active milestone은 없다. `v0.9.22` Apple Silicon macOS beta로 history pagination을
배포하고 native updater 설치까지 검증했다. graph에서 요청당 200개씩 이전 기록을 읽으며
범위·종료·loaded-only filter를 안내한다. append의 화면 상태와 마지막 page의 실제 focus를
보존한다. 공개 asset 6개·rolling manifest·설치 binary/서명을 검증했으며 native에서 마지막
기록까지 조회한 결과가 고정 operation의 CLI 전체 결과와 일치했다.
소유 계약은 `docs/ARCHITECTURE.md`의 Projection Cache와 Change History Rendering,
배포 계약은 `docs/releases/v0.9.22.md`, 검증 범위는 `docs/completed-milestones.md`다.

업데이트 재시작 관찰 중 동시 앱 인스턴스와 registry JSON 손상을 발견했다. 보존된 유효
JSON으로 등록 정보를 복구한 뒤 단일 인스턴스에서 재검증했다. 중복 기동 원인은 미확정이며
다중 인스턴스의 registry 쓰기 보호는 이번 변경에 포함하지 않았다. 후속 범위는
`docs/roadmap.md`의 재검토 항목으로 남긴다.

`v0.9.21` Apple Silicon macOS beta의 command timeout 처리를
배포했다. Unix 호출별 process group과 전체 I/O deadline으로 timeout·cancel·caller drop의
소유 descendant를 정리하고 기존 공유 SSH master를 보존한다. Fetch와 Push timeout을
구분하며 Push는 remote 결과 확인을 안내한다.

canonical gate, 독립 focused review와 same-SHA main/tag CI·Release가 통과했다.
fresh public asset 6개와 rolling updater manifest를 검증하고 native updater로 설치했다.
설치 버전·공개 binary 일치·서명, 정상 Fetch 완료와 합성 지연 Fetch의 60초 timeout 뒤
오류 안내·Ready 복귀·descendant 종료·기존 SSH master 보존을 확인했다.
실제 network 전환 재현과 remote host process 종료 보장은 이 검증 범위에 포함하지 않는다.

소유 계약은 `docs/ARCHITECTURE.md`의 Process Timeout And SSH Reuse, 배포와 제한은
`docs/releases/v0.9.21.md`, 종료 당시 검증은 `docs/completed-milestones.md`에 기록했다.

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
