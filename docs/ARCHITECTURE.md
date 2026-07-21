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
       -> Per-repository Operation Queue
```

## Component Boundaries

### Desktop Shell

window, tabs, quick switcher, graph/diff surface와 editor/terminal handoff를 소유한다.
repository semantics와 SSH process 조립은 소유하지 않는다.
Add repository dialog는 local과 SSH transport를 같은 form에서 선택한다. local path action은
Tauri native directory picker로 경로 하나만 선택한다. SSH path action은 machine-local
OpenSSH config의 explicit host alias를 선택한 뒤 bounded stdio directory metadata query로
remote folder를 탐색한다. 선택된 경로는 기존 registry validation과 canonical identity
흐름으로 넘기며 folder basename은 사용자가 이름을 직접 수정하기 전까지만 display name
제안으로 사용한다.

### Repository Registry

host reference, repository path, display name, pinned/recent state를 local application data로
저장한다. private host inventory와 실제 path는 tracked repository artifact에 넣지 않는다.
현재 schema v1 JSON은 repository, selected repository와 cached projection만 저장하며
credential과 source content는 저장하지 않는다. invalid JSON은 별도 corrupt copy로 보존하고
빈 registry로 복구하며, 미래 schema는 덮어쓰지 않고 중단한다.
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

### Operation Queue

repository별 mutation을 직렬화한다. 실행 전 operation ID와 target identity를 확인하고,
결과 operation 및 undo 경로를 기록한다. 다른 repository의 작업은 독립적으로 진행한다.

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
- **Registry:** application data의 schema-versioned JSON을 사용한다. schema v0 migration,
  v1 round trip, invalid data recovery와 future-schema fail-closed를 test한다.
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
