# Architecture

## Status

이 문서는 제품 경계와 runtime 결정을 소유한다. P0 evidence에 따라 desktop runtime은
Tauri 2 + Rust 2024 core, frontend는 React + TypeScript + Vite로 확정했다.

## System Shape

```text
Desktop Shell
  -> Repository Registry
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

### Repository Registry

host reference, repository path, display name, pinning과 last-opened metadata를 local application data로
저장한다. private host inventory와 실제 path는 tracked repository artifact에 넣지 않는다.
현재 schema v3 JSON은 repository, selected/open repository ordering, pinning/last-opened metadata와
cached projection을 저장하며 credential과 source content는 저장하지 않는다. invalid JSON은
별도 corrupt copy로 보존하고 빈 registry로 복구하며, 미래 schema는 덮어쓰지 않고 중단한다.
v2→v3 migration은 repository, selected/open ordering, pinning과 last-opened metadata를
보존하고 display-formatted rename path를 포함할 수 있는 legacy projection cache만
무효화한다.
repository remove는 registry entry, cached projection과 shell의 open tab만 제거하며 local
directory, remote directory와 Jujutsu metadata에는 delete command를 실행하지 않는다.

local repository 입력은 absolute path와 `~/...`를 허용한다. `~/...`는 Tauri가 제공하는
user home을 기준으로 lexical normalization한 absolute path로 바꾼 뒤 identity를 계산하고
registry에 저장한다. process working directory 기준 relative path는 허용하지 않는다.

### Repository Driver

local과 SSH 구현이 공유하는 typed request/result contract다. command invocation, capability,
status/log/diff projection과 mutation result를 추상화한다.

### SSH Driver

사용자의 OpenSSH config와 agent를 존중하고 별도 credential store를 만들지 않는다.
기본 transport는 listening port 없는 stdio다. argv, cwd, timeout, cancellation과 output
limit를 구조화하고 shell interpolation을 금지한다. 원격 query는 고정 `sh -s` command와
stdin script를 사용하고, repository path는 UTF-8 hex로 전달해 remote shell argv에 직접
삽입하지 않는다. 비대화형 PATH에 `jj`가 없으면 일반적인 user/system install location을
고정 순서로 조회하며 탐지된 경로를 UI나 tracked evidence에 노출하지 않는다.
remote folder browse도 같은 OpenSSH argv/timeout/output limit boundary를 사용하고 directory
path metadata만 반환한다. source file content, credential과 전체 host inventory는 projection
또는 registry에 저장하지 않는다.

### jjcat-agent

plain `jj` CLI만으로 안정적인 projection을 만들 수 없다는 evidence가 생길 때 추가하는
선택적 remote helper다. 설치, upgrade, compatibility와 제거 경로가 검증되기 전에는
필수 구성 요소로 만들지 않는다.

### Projection Cache

선택한 저장소의 last-known status, graph와 revision detail을 즉시 표시한다. stale state를
명확히 표시하고 refresh 결과와 섞어 현재 상태처럼 보이지 않게 한다.
revision detail은 전체 description, author/committer identity와 timestamp, full commit ID,
parent commit ID, bookmark와 changed-file metadata를 포함한다. commit trailer는 description의
일부로 그대로 보존하며 source file content는 포함하지 않는다. 기존 v3 cache에 새 detail
field가 없으면 빈 optional metadata로 읽고 다음 refresh에서 채운다.
active/inactive tab은 서로 다른 bounded interval로 refresh하며 repository별 동시 query는
하나만 허용한다. 실패는 cache를 보존하고 bounded exponential backoff와 offline state로
표시한다.

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
repository rail은 선택할 때 바뀌는 recent ordering을 만들지 않고 pinned/local/SSH grouping의
registry order를 보존한다. selected projection의 working copy, local/remote bookmark와
conflict metadata는 stable history filter와 count로 노출한다.
desktop density는 20px history row와 압축된 titlebar/toolbar를 사용해 기본 창 크기에서
20개 이상의 change를 노출한다. system UI font, 10-12px의 readable text floor, 높은
foreground contrast와 의미가 있는 state/graph에 한정된 accent color를 유지한다. repository와
inspector tab은 flat segmented surface와 명시적 separator/selected state를 사용한다.
native shell은 blank titlebar drag와 8방향 edge/corner resize hit area를 제공한다.
overview는 author/committer, refs와 identity, 전체 commit message와 changed files를 같은
고정 inspector에서 읽게 한다. graph/history와 inspector 사이의 separator는 pointer drag,
위/아래 방향키, Home/End와 double-click reset을 지원하며 양쪽 작업면의 최소 높이를 보존한다.

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
읽는다. current non-snapshot operation만 undo eligibility target으로 분류하며 P3 UI는 exact
current operation의 confirmed undo preview를 제공한다.

### Operation Queue

P3 mutation은 read-only preview와 confirmed execute를 분리한다. preview는 repository,
current operation, exact target identity와 typed effect를 opaque token에 묶는다. execute는
같은 token을 단 한 번만 받고 repository별 queue 안에서 current operation과 dynamic candidate
set을 다시 검사한다. stale/duplicate/invalid request는 command를 실행하지 않는다.

성공은 exit status만이 아니라 새 operation과 action별 fresh projection postcondition으로
확인한다. 실패 뒤 operation이 바뀌었거나 divergent state가 관측되면 recovery-required로
표시하고 operation log, refresh와 exact undo entrypoint를 제공한다. jjcat 외부 process와의
operation race를 완전히 잠그는 CLI API는 없으므로 execute 직전 recheck와 postcondition
detection의 한계를 사용자에게 숨기지 않는다.

empty pruning은 preview에서 `empty() & mutable()` 후보를 exact commit ID로 열거하고 current
working copy, root, immutable change와 local/remote bookmark target을 보호한다. execute는
동일 operation과 동일 후보 집합일 때만 그 IDs를 abandon한다.

graph drag-and-drop과 keyboard shaping은 command를 직접 호출하지 않고 같은 rebase preview를
연다. push는 별도 remote-write risk와 exact bookmark confirmation을 요구하며 force/delete
option은 제공하지 않는다.

## CLI Integration Contract

- 지원 `jj` version과 capability를 연결 시 탐지한다.
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
