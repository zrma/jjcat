# Product Contract

## Positioning

jjcat은 local과 Remote SSH의 여러 Jujutsu 저장소를 탭 단위로 관리하는 desktop
repository cockpit이다. 편집기 창이나 브라우저 서버에 종속되지 않고 저장소 상태,
change graph, diff와 안전한 history shaping을 하나의 지속적인 session에서 제공한다.

## Target User

- 여러 저장소를 동시에 관리하는 `jj` daily user
- 로컬 Mac과 Linux SSH host 사이를 자주 오가는 개발자
- IDE의 한 workspace에 묶이지 않은 독립 VCS GUI를 원하는 사용자
- agent workspace와 사람의 working copy를 함께 관찰하고 정리하는 사용자

## Primary Jobs

1. 등록한 모든 저장소의 변화와 conflict를 한눈에 확인한다.
2. 탭과 quick switcher로 저장소를 즉시 전환한다.
3. change graph와 diff를 읽고 작업의 위치와 내용을 이해한다.
4. 실행될 `jj` mutation과 영향을 확인한 뒤 안전하게 수행하거나 undo한다.
5. 선택한 저장소를 editor 또는 terminal에서 연다.

## Experience Principles

- **Repository first:** host 연결보다 사용자가 관리하는 저장소와 상태가 먼저 보인다.
- **Local and SSH parity:** remote는 별도 모드가 아니라 같은 repository surface다.
- **Fast switching:** cached view를 즉시 표시하고 refresh는 비동기로 수행한다.
- **Dense by default:** graph, change ID, description과 핵심 metadata를 compact row에서 함께
  읽고 선택한 change의 file/metadata는 하단 inspector에서 확인한다.
- **Safe shaping:** mutation은 대상 revision, 예상 operation, 실행 명령과 undo 경로를 보여준다.
- **Local first:** credential, source content와 private inventory는 사용자 환경을 벗어나지 않는다.
- **Keyboard and pointer:** tab, quick switcher, graph navigation과 drag/drop을 모두 지원한다.

## MVP Surface

- host별 repository registry와 persistent tabs
- repository status badge: working-copy change, conflict, outgoing, behind, refresh state
- read-only change DAG와 revision details
- unified 및 side-by-side diff
- local terminal/editor 및 Remote SSH editor open action
- focused mutation: new, edit, describe, fetch

rebase, squash, split, abandon, bookmark move와 push는 read-only surface와 operation safety가
검증된 뒤 단계적으로 추가한다.

## Non-goals

- Git의 모든 기능을 복제하는 범용 Git client
- source code를 업로드하는 hosted repository service
- SSH credential 또는 private key manager
- IDE, terminal 또는 code review forge 자체의 대체
- 첫 milestone에서 여러 forge의 PR workflow를 지원하는 것

## Product Identity

- Name: `jjcat`
- Tagline: **All your jj repos, one window.**
- Description: **A local and remote repository manager for Jujutsu.**
- Application identifier: `com.1day1coding.jjcat`
- Visual direction: 고양이 꼬리가 change DAG를 그리는 단순한 silhouette. 실제 asset은
  cat outline 안의 node와 edge가 change topology를 이루며, mint graph와 amber target node를
  dark desktop surface 위에 사용한다.
