# Architecture

## Status

이 문서는 제품 경계와 runtime 결정을 소유한다. P0 evidence에 따라 desktop runtime은
Tauri 2 + Rust 2024 core, frontend는 React + TypeScript + Vite로 확정했다.

## System Shape

```text
Desktop Shell
  -> Repository Registry
  -> Repository Source Discovery
       -> Local bounded directory walk
       -> SSH bounded directory walk over one OpenSSH session
  -> Repository Session
       -> Local Driver -> jj CLI
       -> SSH Driver   -> OpenSSH stdio -> jj CLI or jjcat-agent
       -> Projection Cache
       -> Read-only Operation Inspection
       -> Per-repository Operation Queue (P3)
```

## Component Boundaries

### Desktop Shell

window, tabs, quick switcher, stable repository/reference navigation, graph/diff surface와
editor/terminal handoff를 소유한다.
repository semantics와 SSH process 조립은 소유하지 않는다.
Add repository dialog는 local과 SSH transport를 같은 form에서 선택한다. local path action은
Tauri native directory picker로 경로 하나만 선택한다. SSH path action은 machine-local
OpenSSH config의 explicit host alias를 선택한 뒤 bounded stdio directory metadata query로
remote folder를 탐색한다. 선택된 경로는 기존 registry validation과 canonical identity
흐름으로 넘기며 folder basename은 사용자가 이름을 직접 수정하기 전까지만 display name
제안으로 사용한다.
Add repository source dialog도 같은 local/SSH folder selection을 사용하되, 선택한 폴더를
저장소 자체가 아니라 발견 범위로 등록한다. rail은 source별 folder/repository tree를
안정된 이름 순서로 표시하고 발견한 repository의 double-click/`Enter`를 기존 canonical
repository identity와 persistent tab 흐름으로 연결한다. direct single-repository add는
별도 진입점으로 유지한다.

### Repository Registry

host reference, repository path, display name, pinning과 last-opened metadata를 local application
data로 저장한다. private host inventory와 실제 path는 tracked repository artifact에 넣지
않는다. 현재 schema v4 JSON은 repository, selected/open repository ordering,
pinning/last-opened metadata, cached projection, repository source와 마지막 bounded discovery
catalog을 저장하며 credential과 source content는 저장하지 않는다. invalid JSON은 별도
corrupt copy로 보존하고 빈 registry로 복구하며, 미래 schema는 덮어쓰지 않고 중단한다.
v2→v3 migration은 display-formatted rename path를 포함할 수 있는 legacy projection cache만
무효화하고, v3→v4 migration은 기존 repository/tab/cache를 보존한 채 빈 source catalog을
추가한다.
repository remove는 registry entry, cached projection과 shell의 open tab만 제거하며 local
directory, remote directory와 Jujutsu metadata에는 delete command를 실행하지 않는다.
repository source remove도 source와 discovery catalog만 제거하며 발견한 repository,
이미 연 tab 또는 local/remote directory를 제거하지 않는다.

local repository 입력은 absolute path와 `~/...`를 허용한다. `~/...`는 Tauri가 제공하는
user home을 기준으로 lexical normalization한 absolute path로 바꾼 뒤 identity를 계산하고
registry에 저장한다. process working directory 기준 relative path는 허용하지 않는다.

### Repository Driver

local과 SSH 구현이 공유하는 typed request/result contract다. command invocation, capability,
status/log/diff projection과 mutation result를 추상화한다.

### Repository Source Discovery

source root부터 사용자가 고른 1–6 folder depth만 탐색하고 최대 500개 repository를
name/path 기준의 deterministic order로 반환한다. `.jj`가 있는 directory를 발견하면 그
하위로 내려가지 않는다. hidden directory, `.git`, `.jj`, dependency/build output와 symlink는
탐색하지 않는다. local은 filesystem metadata API를 사용하고 SSH는 한 OpenSSH stdio
session의 NUL-safe path stream을 사용한다. 발견 결과는 repository identity가 아니라
source-relative catalog이며, 사용자가 repository를 열 때 canonical identity를 계산하고
이미 등록된 repository/tab이 있으면 재사용한다.

### SSH Driver

사용자의 OpenSSH config와 agent를 존중하고 별도 credential store를 만들지 않는다.
기본 transport는 listening port 없는 stdio다. argv, cwd, timeout, cancellation과 output
limit를 구조화하고 shell interpolation을 금지한다. 원격 query는 고정 `sh -s` command와
stdin script를 사용하고, repository path는 UTF-8 hex로 전달해 remote shell argv에 직접
삽입하지 않는다. 비대화형 PATH에 `jj`가 없으면 일반적인 user/system install location을
고정 순서로 조회하며 탐지된 경로를 UI나 tracked evidence에 노출하지 않는다.
remote folder browse도 같은 OpenSSH argv/timeout/output limit boundary를 사용하고 directory
path metadata만 반환한다. source file content, credential과 전체 host inventory는 projection
또는 registry에 저장하지 않는다. source discovery도 별도 SSH connection을 repository마다
만들지 않고 source 하나당 bounded session 하나를 사용한다.

### jjcat-agent

plain `jj` CLI만으로 안정적인 projection을 만들 수 없다는 evidence가 생길 때 추가하는
선택적 remote helper다. 설치, upgrade, compatibility와 제거 경로가 검증되기 전에는
필수 구성 요소로 만들지 않는다.

### Projection Cache

선택한 저장소의 last-known status, graph와 revision detail을 즉시 표시한다. stale state를
명확히 표시하고 refresh 결과와 섞어 현재 상태처럼 보이지 않게 한다.
graph projection은 visible head의 ancestor 중 최근 최대 200개 change만 topology,
description, identity와 bookmark의 bounded JSONL로 읽고 change별 changed-file 목록은 포함하지
않는다. 선택한 revision은 별도 bounded query로 동일 identity를 재검증하면서 changed-file
metadata를 읽는다. commit trailer는 description의 일부로 그대로 보존하며 source file
content는 포함하지 않는다. 이 row/file 분리는 visible head나 파일 수가 큰 repository가 전체
graph refresh의 1 MiB capture budget을 소진하지 않게 한다. 선택 detail의 metadata capture도
4 MiB로 제한하고 diff 직전에는 같은 revision의 canonical file membership을 다시 확인한다.
workspace inventory의 machine-readable core에는 fallible path metadata를 포함하지 않는다.
각 registration의 path는 이름을 exact argument로 전달한 별도 best-effort query로 보강하며,
기록된 path가 없는 legacy workspace 하나가 전체 projection과 다른 repository refresh를
실패시키지 않게 한다. 현재 workspace는 `jj root`와 current-working-copy hint를 함께 사용해
식별한다.
active/inactive tab은 서로 다른 bounded interval로 refresh하며 repository별 동시 query는
하나만 허용한다. 실패는 cache를 보존하고 bounded exponential backoff를 적용한다. 일반
query/parse 실패는 SSH 단절로 단정하지 않고 `Refresh failed`로 표시하며, transport 자체가
사용 불가능한 상태와 구분한다.

### Developer Tool Handoff

editor handoff는 local path 또는 OpenSSH alias와 remote path를 VS Code CLI의 분리된 argv로
전달한다. terminal handoff는 platform launcher를 사용한다. shell command string을 만들지
않으며 UI 결과에는 repository display name과 action label만 표시한다. custom editor command
template와 remote terminal working-directory bootstrap은 이후 configuration milestone에서
다룬다.

### Change History Rendering

40개 이상 change는 고정 높이 windowing과 overscan을 사용해 visible row만 DOM에 유지한다.
전체 row count와 item position은 accessibility metadata로 보존한다. parent relation 전체를
먼저 deterministic lane model로 계산하므로 virtual window 밖에서도 edge가 안정적이다.
pointer와 위/아래 방향키 selection은 같은 revision state를 사용하며 화면 밖 선택은 scroll
window가 따라간다.
`All Changes`는 working copy, current/other workspace copy, local/remote bookmark와 conflict를
reference anchor로 삼고 각 anchor의 인접 change를 기본 노출한다. anchor에서 떨어진 연속
구간은 실제 projection을 삭제하지 않고 `~` fold row로 축약한다. 사용자는 각 구간에서 10개씩,
전체를 펼치거나 다시 접을 수 있다. search와 dedicated conflict view는 일치 항목을 숨기지
않으며 selection과 normal-state DAG layout은 원본 bounded projection을 기준으로 계산한다.
rebase preview는 source와 destination을 임시 anchor로 노출한 뒤 제안 parent relation에 맞춘
stable topological order를 별도 display projection으로 사용한다.
repository rail은 선택할 때 바뀌는 recent ordering을 만들지 않고 pinned/local/SSH grouping의
registry order를 보존한다. `All Changes`는 bounded graph projection의 행 수를 총 history
개수처럼 노출하지 않는다. `Working Copy`는 history filter가 아니라 현재 change의 file
tree/diff 작업면을 열며, 별도 bounded query로 얻은 실제 changed-file count를 표시한다.
`Workspaces`는 repository에 등록된 모든 working directory와 각 working-copy change,
changed-file/conflict/empty state를 한 화면에 열거한다. current workspace는 보호하며 다른
workspace의 `Remove`는 exact registered path를 preview한 뒤 registration과 해당 directory를
한 번에 정리한다. 제거 대상은 empty working-copy change로 제한하며 그 change도 같은
mutation에서 abandon한다. current/non-empty workspace, filesystem root, current workspace의
ancestor, symlink target은 backend에서 거부한다.
local/remote bookmark는 graph label, search, mutation과 위 reference anchor로 노출하며
동일한 `All Changes` 결과를 줄이는 별도 sidebar filter/count는 두지 않는다. conflict는
dedicated repository view를 유지한다.
desktop density는 20px history row와 압축된 titlebar/toolbar를 사용해 기본 창 크기에서
20개 이상의 change를 노출한다. system UI font, 10-12px의 readable text floor, 높은
foreground contrast와 의미가 있는 state/graph에 한정된 accent color를 유지한다. repository와
inspector tab은 flat segmented surface와 명시적 separator/selected state를 사용한다.
native shell은 blank titlebar drag와 8방향 edge/corner resize hit area를 제공한다.
main window의 size, position과 maximized state는 Tauri window-state plugin이 app-owned
local data로 저장하고 quit/relaunch와 updater restart 뒤 복원한다.
overview는 author/committer, refs와 identity, 전체 commit message와 changed files를 같은
고정 inspector에서 읽게 한다. graph/history와 inspector 사이의 separator는 pointer drag,
위/아래 방향키, Home/End와 double-click reset을 지원하며 양쪽 작업면의 최소 높이를 보존한다.
사용자가 조정한 inspector 높이는 container 대비 비율을 versioned local preference로
저장해 window 크기가 바뀌어도 같은 배치를 복원하며 double-click reset은 이 preference를
제거한다.
change-level mutation은 범용 action catalog가 아니라 selected change 옆의 visible `Change`
menu와 graph row context menu에서 시작한다. repository-level pruning은 stable repository
navigation과 repository row context menu에 두며 rail이 접히는 narrow window에서만 compact
toolbar fallback을 제공한다. 이 entrypoint들은 mutation command를 직접 실행하지 않고 아래의
동일한 preview/confirmation queue로 intent를 전달한다.

### Diff Inspection

file list는 cached revision metadata지만 source content는 사용자가 file을 선택한 시점에만
commit identity와 cached file membership을 다시 확인한 뒤 읽는다. local과 SSH 모두 같은
structured hunk contract를 반환하며 capture는 512 KiB로 제한한다. binary와 truncated output은
명시적 metadata state로 표시하고 content를 registry/cache에 저장하지 않는다. frontend는 같은
projection을 unified 또는 side-by-side로 렌더링하고 whitespace mode 변경 시 선택 file만 다시
조회한다. side-by-side의 Before/After는 같은 폭의 독립 pane과 개별 가로 스크롤을 사용해
한쪽의 긴 source line이 반대쪽 pane을 밀어내지 않는다. macOS의 overlay scrollbar 설정과
무관하게 overflow를 발견할 수 있도록 각 pane은 실제 scroll position과 동기화된 proportional
thumb를 항상 표시하고 track click, drag와 keyboard range navigation을 제공한다.
rename/copy의 display-formatted summary는 command selector로 사용하지 않는다. projection에는
target의 canonical repository path와 별도의 display path를 저장하고 local/SSH driver 모두 escaped
`root-file:"<path>"` exact fileset으로 diff 범위를 제한한다.
하단 inspector는 overview, hierarchical changed-file tree/diff와 operation history를 고정
tab으로 제공한다. overview의 file 선택은 같은 selected revision을 유지한 채 diff tab으로
전환한다.

### Remote Divergence

outgoing과 behind는 network fetch를 실행하지 않고 local bookmark와 `git` pseudo-remote를
제외한 network remote bookmark의 locally stored graph를 비교한다. UI는 이를 `Last fetched`로
표시하고 projection cache의 cached/stale/disconnected freshness와 별도 상태로 유지한다.

### Operation Inspection

최근 operation은 `--at-op=@ --ignore-working-copy`를 강제한 local/SSH query로 최대 20개만
읽는다. 의미 있는 current operation을 undo target으로 분류하고, `jj`가 기록한 undo/redo
operation chain에서 다음 redo step을 판별한다. toolbar와 Operations inspector의
Undo/Redo, `⌘Z`/`⌘⇧Z` 및 `Ctrl+Z`/`Ctrl+Y`는 모두 exact current operation을 고정한
preview token을 내부에서 발급받아 별도 confirmation dialog 없이 즉시 한 step을 이동한다.
같은 경로를 반복해 여러 step을 왕복하며 입력 field의 일반 text undo/redo는 가로채지
않는다. 연속 입력은 repository별 단일 in-flight guard로 직렬화한다.

### Operation Queue

P3 mutation은 read-only preview와 confirmed execute를 분리한다. preview는 repository,
current operation, exact target identity와 effect description을 opaque token에 묶는다. execute는
같은 token을 단 한 번만 받고 repository별 queue 안에서 current operation과 dynamic candidate
set을 다시 검사한다. stale/duplicate/invalid request는 command를 실행하지 않는다.
`jj undo`로 복원 가능한 local mutation preview는 pointer button 외에 `Enter`/`Y` 실행과
`Esc`/`N` 취소를 제공한다. directory를 삭제하는 `removeWorkspace`와 remote state를
변경하는 `push`는 typed phrase와 `Enter`/`Y` 실행을 제공하지 않고 exact target이 표시된
명시적 pointer click만 허용한다. 취소의 `Esc`/`N`은 모든 preview에서 유지한다.

성공은 exit status만이 아니라 새 operation과 action별 fresh projection postcondition으로
확인한다. 실패 뒤 operation이 바뀌었거나 divergent state가 관측되면 recovery-required로
표시하고 operation log, refresh와 exact undo/redo entrypoint를 제공한다. jjcat 외부 process와의
operation race를 완전히 잠그는 CLI API는 없으므로 execute 직전 recheck와 postcondition
detection의 한계를 사용자에게 숨기지 않는다.

empty pruning은 preview에서 `empty() & mutable()` 후보를 exact commit ID로 열거하고 모든
workspace의 working copy, root, immutable change와 local/remote bookmark target을 보호한다. execute는
동일 operation과 동일 후보 집합일 때만 그 IDs를 abandon한다.
workspace removal은 fresh workspace inventory에서 exact name, path, working-copy commit,
empty/current 여부를 다시 확인하고 current 또는 non-empty workspace를 거부한다. local/SSH
모두 registration을 제거하고 previewed empty working-copy change를 abandon한 뒤 exact
registered directory를 삭제하며 untracked/ignored file도 대상에 포함한다. 성공은 fresh
projection에서 registration과 해당 visible change가 사라지고 directory가 존재하지 않는
경우에만 인정한다.
preview와 단일 destructive 실행 버튼 외에 typed phrase나 추가 확인 단계는 요구하지 않는다.

graph drag-and-drop과 keyboard shaping은 command를 직접 호출하지 않고 같은 rebase preview를
연다. push는 별도 remote-write risk와 exact bookmark confirmation을 요구하며 force/delete
option은 제공하지 않는다.
local bookmark label은 change row와 독립된 drag source다. label을 다른 change에 drop하면
local bookmark 존재 여부와 exact destination을 다시 확인한 `bookmarkMove` preview를 즉시
열며, remote-only bookmark label은 이동 입력을 제공하지 않는다.
pointer rebase는 hover 중 source의 parent relation만 client-side로 바꾸고 자식이 부모보다
먼저 오도록 stable topological order를 다시 계산한다. 이 예상 topology는 command output이
아니며 cycle target을 거부한다. drop은 mutation을 실행하지 않고 backend-issued opaque
token을 사용하는 exact mutation preview를 즉시 연다. source, source descendants와
destination만 영향 범위로 취급해 current layout을
neutral ghost로 낮추고 proposed layout을 deep-blue dashed style로 다시 그린다. lane 재배치만
발생한 무관한 row와 fold 구간에는 proposed color를 적용하지 않는다. lane 번호는 bookmark
의미로 사용하지 않으며 실제 bookmark metadata가 있는 target node만 amber로 표시한다.
moving bookmark target은 blue fill과 amber outline을 함께 사용한다.
mutation dialog는 action catalog를 다시 선택하게 하지 않고 entrypoint에서 전달된 단일
intent의 parameter와 exact targets만 보여준다. 따라서 change, repository, network와 recovery
범위가 한 native select에 섞이지 않는다.

## CLI Integration Contract

- 지원 `jj` version과 capability를 연결 시 탐지한다.
- frontend에서 Tauri로 전달하는 mutation intent는 variant와 내부 field 모두 camelCase를
  사용한다. Rust enum은 snake_case field를 유지하되 Serde `rename_all_fields`로 경계를
  명시하며 모든 variant의 JSON round trip을 회귀 테스트한다.
- human-readable 기본 출력에 의존하지 않고 template 또는 helper protocol을 사용한다.
- stdout, stderr, exit status, timeout과 cancellation을 분리한다.
- output은 bounded하며 ANSI와 terminal prompt를 허용하지 않는다.
- remote error는 secret, host detail과 absolute path를 redaction한 뒤 UI에 전달한다.

## Security Boundary

- source file content는 사용자가 diff를 요청한 범위에서만 읽는다.
- SSH private key, agent socket과 credential은 jjcat process가 보관하거나 복제하지 않는다.
- 기본 설정에서 network listener를 열지 않는다.
- command preview는 민감한 environment value를 포함하지 않는다.
- mutation은 read-only query와 별도 capability 및 confirmation surface를 사용한다.

### macOS Beta Updater

desktop shell은 registry load와 분리해 startup 1초 뒤 10초 bounded beta-channel check를
한 번 실행한다. 장시간 열린 instance는 주기 polling하지 않으며 app menu의
`Check for Updates…`가 명시적인 재확인 경로다. no-update와 자동 check 실패는 repository
readiness를 가리지 않는다. update가 확인된 경우에만 status bar trailing edge에
`jjcat <version>` download action을 노출하고,
download/install을 시작한 `Update` handle은 ready 또는 retry 경계까지 다른 check로
교체하지 않는다. 다운로드가 끝나도 재시작은 자동 실행하지 않으며, running repository
operation이 없을 때 사용자가 `Restart to update`를 선택해야 한다.

production updater endpoint와 공개키는 release-only Tauri config overlay에 들어간다.
workflow는 공개키를 repository variable에서 읽고 password-protected private key는 secret
store에서만 읽는다. production endpoint는 HTTPS rolling beta manifest로 고정하며,
insecure transport override는 explicit loopback-only local smoke에서만 생성할 수 있고
release workflow에는 허용하지 않는다.

versioned release는 Apple Silicon `.app.tar.gz`와 Tauri Minisign `.sig`를 immutable asset으로
먼저 게시한다. `latest-beta.json`의 `darwin-aarch64`와 `darwin-aarch64-app` entry는 같은
versioned URL과 signature를 가리키며, rolling `updater-beta` asset은 versioned asset 게시가
끝난 뒤에만 교체한다. release verifier는 checksum, manifest shape, archive 안의 app
identity/code seal과 Minisign signature를 모두 확인한다. 이 updater signature는 update
authorization boundary지만 Developer ID identity나 notarization을 대신하지 않는다.

## P0 Technology Decision

- **Desktop shell:** Tauri 2. native macOS bundle과 WebView window를 빌드하고 실제 IPC
  registry/refresh flow를 smoke해 process lifecycle과 testability를 확인했다.
- **Core:** Rust 2024 + Tokio. bounded stdout/stderr, timeout, cancellation, local process와
  OpenSSH stdio를 같은 typed boundary에서 구현하고 fixture test로 검증했다.
- **Frontend:** React + TypeScript + Vite. repository tabs, DAG, inspector, cached/stale/
  disconnected states와 keyboard switch를 구현하고 desktop/narrow viewport에서 검증했다.
- **Projection:** supported floor는 `jj 0.30.0`이며 machine-readable JSONL template를 쓴다.
  P0 local, simulated SSH와 local-only actual SSH matrix가 helper 없이 통과했다.
- **Registry:** application data의 schema-versioned JSON을 사용한다. schema v0/v1/v2 migration,
  v3 round trip, invalid data recovery와 future-schema fail-closed를 test한다.
- **Packaging cost:** macOS는 Xcode, Linux는 WebKitGTK 계열 system dependency를 요구한다.
  signing, notarization, updater와 cross-platform package acceptance는 P4에서 다룬다.

따라서 `jjcat-agent`는 P0/P1 필수 요소가 아니다. latency, compatibility 또는 structured
projection acceptance가 plain CLI로 깨질 때만 다시 검토한다.

## Application Identity

- Product name: `jjcat`.
- Application identifier: `com.1day1coding.jjcat`.
- Identifier basis: product owner가 소유한 domain의 reverse-DNS form.
- 이 값은 app-data location, bundle signing과 update identity의 안정 기준이므로 P0부터
  유지하고 변경이 필요하면 registry migration을 함께 설계한다.
