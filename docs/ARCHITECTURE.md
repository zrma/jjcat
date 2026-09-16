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
desktop는 single-instance 처리를 다른 plugin보다 먼저 초기화하며 두 번째 실행은 기존
main window를 복원·표시·focus한다. macOS는 application data별 OS lease를 먼저 확보한
process만 stale socket을 정리하고 동기적으로 bind한다. 경쟁 process는 기존 owner에 알리고
종료하며 시작/종료 중인 owner는 최대 5초 기다린다. socket은 사용자만 접근하고 인자를
전달하지 않는다. Exit에서 socket을 정리하고 lease는 process 종료까지 유지해 updater
후속 process가 종료 중인 기존 앱으로 전달되지 않게 한다.
registry는 setup 단계에서 별도 lock 파일의 OS 배타
잠금을 확보하고 process 수명 동안 보유한다. 잠금 실패 시 읽기·corrupt recovery·쓰기를
시작하지 않는다. 잠금 파일은 삭제하지 않으며 process 종료/강제 종료 때 OS가 잠금을 해제한다.
process 내부 load→수정→save는 같은 mutex 아래 실행한다. 저장은 같은 디렉터리의 고유
임시 파일에 serialize·sync한 뒤 atomic replace하고 Unix에서는 디렉터리도 sync한다.
이전 버전은 이 lock을 준수하지 않으므로 신·구 버전의 동시 실행은 지원하지 않는다.
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

### Repository Refresh

Refresh는 local/SSH 모두 supported jj version을 확인한 뒤 작업 사본을 한 번 snapshot하고
colocated Git 변경을 import한 다음 bounded projection query를 실행한다. network fetch는
실행하지 않으므로 outgoing/behind는 계속 last-fetched 상태를 뜻한다. tab, rail 또는
quick switcher에서 repository를 선택하면 cached view를 즉시 표시하고 비동기 refresh를
요청한다. 이미 선택된 tab을 다시 눌러도 같은 경로를 사용하며 진행 중인 refresh는
취소하지 않고 deduplicate한다. background refresh도 같은 snapshot 경로를 사용한다.

snapshot은 기존 repository별 refresh/mutation exclusion 안에서 실행하며 timeout,
cancellation과 redacted failure를 유지한다. read-only `project`는 snapshot하지 않아 mutation
preview와 postcondition inspection의 operation precondition을 보존한다. 다른 process와의
동시 변경을 잠그거나 다른 workspace의 stale 상태를 강제로 복구하지는 않는다.

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
graph projection은 visible head의 ancestor를 최초 200개, 명시적 추가 요청당 최대 200개씩
topology, description, identity, bookmark와 tag의 bounded JSONL로 읽는다. 전체 탐색 개수나
날짜 상한은 두지 않으며 change별 changed-file 목록은 포함하지 않는다. 201번째 sentinel로
다음 page 존재를 확인하므로 전체 개수를 계산하지 않는다. history의 operation ID를 고정하고
이미 읽은 topological prefix의 가장 오래된 경계에서 descendants를 제외해 다음 page를
조회한다. 마지막 행의 조상만 추적하지 않으므로 다른 visible head와 merge parent도 유지한다.
local argv와 SSH stdin은 같은 조회 계약을 사용한다. page당 1 MiB 출력, 기존 timeout/cancel과
64 KiB frontier revset 예산을 유지한다. 제한·조회 실패는 기존 cache를 보존하며 전체 완료로
표시하지 않는다. 극단적으로 넓은 frontier의 추가 축약과 대규모 cache eviction은 별도 개선이다.
사용자 요청으로 로딩한 행만 누적하며 cache와 DAG 계산 비용은 누적 행 수에 비례해 증가한다.
추가 요청은 operation ID와 현재 로딩 개수가 cache와 같은지 확인하며 cache 저장까지 refresh와
mutation에 대해 직렬화한다. 같은 operation의 refresh는 누적 history를 보존하고 새 operation은
새 첫 page로 교체한다. operation이 정리되어 이어 읽을 수 없으면 refresh로 새 시점에서 시작한다.
 선택한 revision은 별도 bounded query로 동일 identity를 재검증하면서 changed-file
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
window가 따라간다. graph 행에서 방향키로 이동할 때 실제 DOM focus도 선택 행을 따라간다.
가상 window 교체 중에는 graph container가 focus를 유지하며 새 행 렌더링 후 해당 행에
넘긴다. 선택 행만 Tab 진입점으로 두고 aria-selected로 선택을 노출한다. Enter·Space는
현재 행에 적용된다. 펼침 control의 방향키는 graph selection을 바꾸지 않으며 search,
fold control과 다른 panel에서 발생한 selection 갱신은 focus를 빼앗지 않는다.
`All Changes`는 working copy, current/other workspace copy, local/remote bookmark, revision
tag와 conflict를 reference anchor로 삼고 각 anchor의 인접 change를 기본 노출한다. anchor에서 떨어진 연속
구간은 실제 projection을 삭제하지 않고 `~` fold row로 축약한다. 사용자는 각 구간에서 10개씩,
전체를 펼치거나 다시 접을 수 있다. `Show all`은 클릭한 fold의 범위만 펼치며 선택 행을
사이에 둔 반대쪽 fold의 접힘은 유지한다. 펼칠 때 구간을 나누던 선택 context anchor를
함께 보존해 선택 이동으로 인접 행이 다시 접히거나 control 위치·개수가 바뀌지 않는다.
context 행은 펼침 개수에 포함하지 않는다. `Show more`도 같은 경계를 유지하면서 현재
구간에서 최대 10개를 추가 노출한다. 경계 양옆의 펼침이 모두 접히면 보존 anchor를 해제한다.
명시적으로 펼친 change ID는 selection·scroll 이동과
독립적으로 유지한다. 숨긴 change를 선택하면 그 인접 행만 임시 노출하고 기존 펼침은
보존한다. 떨어진 펼침 구간 사이의 fold row는 실제 숨긴 위치를 유지하며 Collapse는 해당
control 구간의 명시적 펼침만 해제한다. repository·operation·filter가 변경되면 화면 상태를 재설정하되 선택 행을 다시 노출한다.
page append와 동일 operation refresh는 선택·scroll·명시적 펼침을 보존한다. 펼침 상태를
restart 사이에 저장하지 않는 경계는 유지한다. graph 하단의 `Load older history`는 데이터
조회이며 구간의 `Show more`/`Show all`은 이미 로딩한 행의 펼침이다. footer는 로딩 개수와
이전 기록 존재/전체 완료를 표시하고 filter는 로딩된 행만 대상으로 함을 안내한다. 결과가
없는 filter에서도 추가 로딩 control을 제공한다. 로딩 중과 마지막 page 이후에도 같은 버튼을
유지하고 aria-disabled로 요청을 막아 실제 keyboard focus를 보존한다.
search와 dedicated conflict view는 일치 항목을 숨기지
않으며 selection과 normal-state DAG layout은 현재 로딩된 projection을 기준으로 계산한다.
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
local/remote bookmark는 graph label, search, mutation과 위 reference anchor로 노출한다.
revision tag는 bookmark와 구분되는 read-only graph/overview label, search와 reference
anchor로 노출하며 move/push affordance를 제공하지 않는다. 동일한 `All Changes` 결과를
줄이는 별도 sidebar filter/count는 두지 않는다. conflict는 dedicated repository view를 유지한다.
desktop density는 20px history row와 압축된 titlebar/toolbar를 사용해 기본 창 크기에서
20개 이상의 change를 노출한다. system UI font, 10-12px의 readable text floor, 높은
foreground contrast와 의미가 있는 state/graph에 한정된 accent color를 유지한다. repository와
inspector tab은 flat segmented surface와 명시적 separator/selected state를 사용한다.
native shell은 blank titlebar drag와 8방향 edge/corner resize hit area를 제공한다.
main window의 size, position과 maximized state는 Tauri window-state plugin이 app-owned
local data로 저장하고 quit/relaunch와 updater restart 뒤 복원한다.
macOS main application window는 native Tauri `RunEvent::Ready`에서 show 뒤 focus해 regular
GUI launch와 updater relaunch 모두 incoming binary가 직접 전면 presentation을 소유한다.
별도 diff Quick Look window는 이 path의 target이 아니다. `v0.9.9`가 남길 수 있는 legacy
one-shot foreground intent는 main frontend startup에서 제거하지만 activation precondition으로
사용하지 않는다.
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
조회한다. side-by-side의 Before/After는 같은 폭의 독립 overflow pane을 사용해 한쪽의 긴
source line이 반대쪽 pane을 밀어내지 않으며, 어느 pane을 조작해도 양쪽의 상대 가로 위치를
동기화한다. macOS의 overlay scrollbar 설정과 무관하게 overflow를 발견할 수 있도록 각 pane은
실제 scroll position과 동기화된 proportional thumb를 항상 표시하고 track click, drag와
keyboard range navigation을 제공한다. 인접한 deletion/addition 교체 줄은 단어 단위로
비교하고 충분히 유사한 단어는 문자 단위로 세분화해 unified와 side-by-side 양쪽에서 실제
변경 구간을 강조한다. 과도하게 긴 줄이나 유사도가 낮은 줄은 bounded 계산을 넘기지 않고
기존 whole-line styling으로 fallback한다.
unified/side-by-side와 preserve/ignore-all 선택은 app-owned local preference이며 메인
창의 모든 diff surface가 한 상태를 공유한다. 별도 diff window는 열 때 현재 값을
fallback으로 받고, Tauri app event와 browser storage event를 통해 메인 창과 변경을
양방향 동기화한다. 두 값은 quit/relaunch와 updater restart 뒤에도 복원된다.
rename/copy의 display-formatted summary는 command selector로 사용하지 않는다. projection에는
target의 canonical repository path와 별도의 display path를 저장하고 local/SSH driver 모두 escaped
`root-file:"<path>"` exact fileset으로 diff 범위를 제한한다.
하단 inspector는 overview, hierarchical changed-file tree/diff와 operation history를 고정
tab으로 제공한다. overview의 file 선택은 같은 selected revision을 유지한 채 diff tab으로
전환한다.

### Revision File Inspection

`File Tree` inspector는 graph projection에 전체 tree를 넣지 않고 선택 revision에서만
`jj file list`를 lazy 실행한다. selected change의 changed-file metadata를 path로 overlay해
snapshot row에 status를 표시하되, parent에서 삭제된 path처럼 선택 revision에 존재하지 않는
항목은 tree에 만들지 않는다. file 선택은 exact `root-file:"<path>"` metadata query로
membership을 다시 확인한 뒤 최대 512 KiB의 `jj file show` content만 읽는다. binary,
truncated, conflict와 executable state는 typed projection으로 전달하고 source content는
registry/cache에 저장하지 않는다.

`Blame / Timeline…`은 app-owned 별도 window에서 선택 path의 bounded ancestry log와
`jj file annotate` line provenance를 결합한다. provenance는 adjacent source hunk 단위로
표시하고 revision selector, range와 older/newer control은 같은 typed history를 사용한다.
과거 revision을 다시 조회해 backend 결과가 그 revision의 ancestors로 줄어들어도 window
session은 이미 확인한 newer history를 commit ID로 de-duplicate해 유지하므로 사용자가 시작
revision으로 돌아갈 수 있다. local과 SSH는 structured argv/stdin, exact fileset, bounded
output과 redacted error contract를 공유하며 rename 이전 path 추적은 별도 capability로 남긴다.

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

### Process Timeout And SSH Reuse

Unix command는 호출별 process group에서 실행한다. timeout, cancellation과 caller future
drop은 그 그룹의 자식 프로세스까지 종료한다. 기존 공유 SSH master와 별도 세션으로
분리된 프로세스는 종료하지 않는다. remote host의 프로세스 종료까지 보장하지 않으므로
중단된 mutation은 repository state와 operation log를 확인한 뒤 다시 preview한다.

deadline은 command wait, stdin 전달과 stdout/stderr 수집 전체에 적용한다. 부모 command가
먼저 종료해도 descendant나 공유 SSH master가 pipe를 보유하면 같은 deadline에서 반환하며,
분리된 I/O task를 남기지 않는다. Fetch timeout은 network와 공유 연결 재접속 가능성을
안내하고, Push timeout은 remote 결과가 미확정임을 명시해 fetch로 확인한 뒤 재시도하도록
한다. 자동 mutation 재시도나 공유 master 강제 종료는 하지 않는다.

네트워크 전환 후 기존 SSH 연결이 응답하지 않으면 공유 연결을 사용하는 새 command도
대기할 수 있다. 사용자 SSH 설정의 `ServerAliveInterval`과 `ServerAliveCountMax`는
무응답 감지 시간을 제어하고 `ControlPersist`는 client가 없는 연결의 보관 시간을
제어한다. 이 설정과 credential은 사용자 소유이며 앱이 수정하지 않는다. 설정 변경은
새 master부터 적용된다. `ControlMaster no`만으로 기존 연결 재사용을 막을 수는 없으며,
명시적으로 우회할 때는 `ControlPath none`을 사용한다.

## Security Boundary

- source file content는 사용자가 diff를 요청한 범위에서만 읽는다.
- SSH private key, agent socket과 credential은 jjcat process가 보관하거나 복제하지 않는다.
- 기본 설정에서 network listener를 열지 않는다.
- command preview는 민감한 environment value를 포함하지 않는다.
- mutation은 read-only query와 별도 capability 및 confirmation surface를 사용한다.

### macOS Beta Updater

desktop shell은 registry load와 분리해 startup 1초 뒤 10초 bounded beta-channel check를
한 번 실행한다. main window focus가 3초간 유지되면 background check를 예약하고,
그 전에 focus를 잃으면 취소한다. startup/focus/manual 경로의 실제 시도 시각을 공유하며
focus check에는 1시간 cooldown을 적용한다. 주기 polling은 없고 app menu의
`Check for Updates…`는 cooldown을 우회하는 명시적인 재확인 경로다. no-update와 자동 check 실패는 repository
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

## Inspection And Feedback Continuity

repository rail 상단의 Workspace, Repository와 Last Fetched navigation은 고정하고 source와
standalone 목록만 독립적으로 스크롤한다. repository open 뒤에도 목록 위치를 보존한다.
status bar는 현재 repository 정보와 app-global update를 표시하고, repository 전환은
상단 tab, 좌측 navigation과 `Command-K` quick switcher가 소유한다.

file context menu는 우클릭 또는 keyboard menu로 선택한 exact file을 대상으로 diff,
editor, local Finder, single-file split과 path copy를 제공한다. SSH Finder는 비활성화하며
split은 기존 exact preview boundary를 사용한다.

file timeline은 실제 timestamp 비례 ruler와 가까운 marker의 keyboard-accessible cluster를
사용한다. revision refresh 중 기존 provenance를 유지하고 새 결과가 준비되면 교체한다.
window-lifetime bounded LRU와 in-flight dedup, immediate-neighbor best-effort prefetch는
navigation 지연을 줄이지만 cross-path rename history나 무제한 source cache를 제공하지 않는다.

repository mutation과 겹친 refresh는 waiting activity이며 실제 driver/recovery failure와
구분한다. Quick Look 실패는 repository health를 바꾸지 않는다. handoff/path-copy 성공은
4초 transient notice이며 반복 action마다 sequence를 갱신해 오래된 expiry가 최신 notice를
지우지 못하게 한다. persistent error/recovery notice에는 이 만료 정책을 적용하지 않는다.
