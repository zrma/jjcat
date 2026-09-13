# jjcat

<p align="center">
  <img src="src-tauri/icons/icon-source.png" width="240" alt="고양이 윤곽과 Jujutsu change graph를 결합한 jjcat 로고">
</p>

<p align="center">
  <strong>흩어진 jj 저장소를, 한 창에서.</strong><br>
  <sub>All your jj repos, one window.</sub>
</p>

jjcat은 로컬과 SSH 환경의 여러 [Jujutsu](https://www.jj-vcs.dev/) 저장소를
한 창에서 관리하는 데스크톱 앱이다. 저장소를 탭으로 오가며 change graph와 diff를
살펴보고, 변경 이력을 편집하거나 편집기와 터미널로 작업을 이어갈 수 있다.

**[macOS beta 다운로드](https://github.com/zrma/jjcat/releases)** ·
[릴리스 노트](docs/releases/) · [문제 보고](https://github.com/zrma/jjcat/issues)

## 주요 기능

- **여러 저장소 관리** — 로컬·SSH 저장소를 직접 열거나 상위 폴더에서 찾아 등록한다.
  탭 순서와 열린 저장소를 보존하고, quick switcher로 빠르게 전환한다.
- **변경 이력과 diff 탐색** — change graph, bookmark, tag와 충돌 상태를 함께 확인한다.
  unified·side-by-side diff, 선택 revision의 전체 파일 트리와 파일별 Blame/Timeline을 제공한다.
- **실행 전 확인과 되돌리기** — new, edit, describe, rebase, squash, 파일 단위 split,
  abandon, bookmark 이동과 push를 지원한다. 이력 편집은 실행 전 대상을 미리 확인하며,
  Undo/Redo로 operation을 한 단계씩 이동한다.
- **외부 작업과 연동** — 편집기·터미널에서 바꾼 작업 사본을 Refresh로 반영한다.
  저장소 전환 시 캐시를 먼저 보여주고 백그라운드에서 갱신한다.
- **로컬 중심 설계** — 소스 코드와 SSH 인증 정보를 별도 hosted service에 업로드하지 않는다.
  SSH 연결은 사용자의 OpenSSH 설정과 key·agent를 사용한다.

## 설치

현재 **Apple Silicon Mac용 public beta**를 제공한다. macOS 13 이상이 필요하며,
Intel Mac·Windows·Linux용 배포 패키지는 제공하지 않는다.

1. 저장소를 실행할 환경에 Jujutsu CLI를 설치한다. 지원 하한은 `jj 0.30.0`이며,
   `v0.9.18` 릴리스의 검증 기준은 `jj 0.43.x`다.
2. [GitHub Releases](https://github.com/zrma/jjcat/releases)에서 사용할 버전의
   `.dmg`를 내려받아 열고, `jjcat.app`을 Applications 폴더에 복사한다.
3. jjcat을 실행한다. 앱은 번들 무결성을 위한 ad-hoc 서명만 적용되어 있으며,
   **Developer ID 서명과 Apple 공증은 제공하지 않는다.** Gatekeeper가 실행을 차단하면
   **시스템 설정 → 개인정보 보호 및 보안 → 확인 없이 열기**에서 실행을 허용한다.

유료 Apple Developer Program을 통한 서명·공증은 현재 계획된 작업이 아니며,
재검토 조건은 [배포 정책](docs/PUBLICATION.md#macos-developer-identity-decision)에 정리되어 있다.

다운로드 체크섬과 릴리스별 설치 조건은 [릴리스 노트](docs/releases/)에서 확인할 수 있다.
설치 후에는 앱 메뉴의 **Check for Updates…**로 업데이트를 확인한다.
다운로드와 재시작은 사용자가 선택하며, 자동으로 재시작하지 않는다.

SSH 저장소를 사용하려면 원격 환경에도 `jj`가 설치되어 있어야 하며,
OpenSSH host alias로 비대화형 접속이 가능해야 한다.

## 시작하기

1. 왼쪽 저장소 목록의 **+ → Open repository…**에서 로컬 폴더 또는 SSH 저장소를 연다.
   여러 저장소를 한꺼번에 찾으려면 **Add repository source…**로 상위 폴더를 등록한다.
2. 탭이나 **⌘K** quick switcher로 저장소를 전환한다.
3. graph에서 change를 선택해 변경 파일과 diff를 확인한다.
   **File Tree**에서는 해당 revision의 전체 파일을 살펴볼 수 있다.
4. **Change** 메뉴에서 이력을 편집하거나, change를 다른 change 위로 끌어
   rebase preview를 연다. 실행 전에 대상과 영향을 확인한다.
5. **Undo/Redo** 또는 **⌘Z / ⌘⇧Z**로 operation을 한 단계씩 되돌리거나 다시 적용한다.

외부 편집기의 파일 변경은 **Refresh**로 반영한다. 원격 bookmark 상태를 가져오려면
**Fetch**를 실행한다. outgoing/behind 표시는 마지막 Fetch에서 확인한 상태를 기준으로 한다.

## 소스에서 실행하기

개발에는 Node.js, `pnpm`, Rust toolchain(`cargo` 포함), Jujutsu CLI와
Tauri 2의 플랫폼별 빌드 도구가 필요하다. `pnpm` 버전은
[package.json](package.json)의 `packageManager`를 따른다.

저장소 루트에서 실행한다.

```sh
pnpm install
pnpm tauri dev
```

`pnpm dev`는 브라우저에서 frontend만 실행한다. 폴더 선택, 로컬 명령 실행과
SSH 연결을 포함한 데스크톱 기능은 `pnpm tauri dev`로 확인한다.

전체 로컬 검증:

```sh
scripts/check.sh
```

기여 절차는 [CONTRIBUTING.md](CONTRIBUTING.md), AI 도구의 작업 지침은
[AGENTS.md](AGENTS.md)를 참고한다.

## 문서와 지원

- [제품 범위](docs/PRODUCT.md) · [아키텍처](docs/ARCHITECTURE.md)
- [구현 상태](docs/status.md) · [로드맵](docs/roadmap.md) · [릴리스 노트](docs/releases/)
- [버그 보고와 기능 제안](https://github.com/zrma/jjcat/issues)
- [보안 문제 신고](SECURITY.md) · [공개 자료 작성 정책](docs/PUBLICATION.md)

## 라이선스

jjcat은 [Apache License 2.0](LICENSE)으로 제공한다.
