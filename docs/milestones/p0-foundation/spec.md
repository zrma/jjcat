# Spec: P0 Read-only Repository Cockpit Foundation

Status: completed

## Goal

local과 SSH repository가 같은 domain contract를 통해 등록, 전환, refresh될 수 있음을
minimal desktop vertical slice로 증명한다.

## Context

현재 저장소에는 product/architecture contract와 harness만 있고 runtime은 없다. Fork형
multi-repository 전환 경험과 Remote SSH parity를 증명하려면 UI framework보다 먼저 두
transport가 공유할 repository identity와 read-only projection contract가 필요하다.

## Scope

- repository identity와 `Local` / `Ssh` location model
- persistent registry의 versioned data contract
- `jj` version/capability probe와 read-only status/log projection
- cancellable local process 및 SSH stdio executor boundary
- repository tab selection과 cached status를 보여주는 minimal desktop shell
- P0 evidence에 기반한 desktop/frontend stack 결정

## Constraints

- application identifier는 `com.1day1coding.jjcat`을 사용하고 app-data schema가 생긴 뒤
  변경할 경우 migration을 요구한다.
- 실제 SSH host, credential과 private repository inventory 없이 합성 fixture로 검증한다.
- 실제 SSH acceptance는 machine-local 입력으로만 실행하고 host, path, repository identity와
  raw output을 tracked artifact에 기록하지 않는다.
- read-only contract가 안정되기 전 mutation과 remote helper를 도입하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | focused unit tests | local/SSH location과 stable repository identity |
| C2 | done | fixture integration test | supported `jj` capability, status와 log projection |
| C3 | done | transport integration test | argv/stdin SSH execution, timeout, cancel와 redacted error |
| C4 | done | persistence round trip | versioned registry와 corrupt-state recovery |
| C5 | done | rendered desktop smoke | 두 repository tab 전환과 cached/refresh state |
| C6 | done | architecture decision record | desktop shell, frontend와 helper boundary 결정 |
| C7 | done | `scripts/check.sh` | full local gate와 current docs |

## Required Evidence

- 실제 local fixture와 simulated SSH fixture가 같은 projection contract를 통과한다.
- P0 완료 전 복수의 사용자 소유 원격 저장소에서 local-only SSH smoke를 통과하고,
  tracked evidence에는 redacted matrix와 판정만 남긴다.
- private host, credential과 absolute path가 fixture, snapshot과 failure output에 남지 않는다.
- desktop shell에서 두 repository를 탭 또는 quick switcher로 전환하는 user-visible smoke가 있다.
- stale cache, refresh, disconnected와 command failure가 구분되어 보인다.
- selected stack과 packaging cost를 포함한 architecture decision이 갱신된다.

## Publication Impact

- fixture, snapshot과 error evidence는 합성 repository/host/path만 사용한다.
- prompt, transcript, memory, raw SSH output와 machine-local inventory는 tracked artifact에
  포함하지 않는다.
- P0는 remote 생성, push, license 선택 또는 release를 수행하지 않는다.

## Out Of Scope

- rebase, squash, split, abandon, bookmark move와 push
- source file diff 및 conflict editor
- GitHub/GitLab PR integration
- remote helper 자동 설치
- release packaging과 auto-update

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 `scripts/check.sh`가 통과하며 status/roadmap이
actual runtime과 일치해야 한다.

## Completion Evidence

- Rust unit/integration suite가 identity, registry v0→v1 migration, corrupt/future schema,
  bounded output, timeout, cancel, redaction과 local/simulated SSH projection을 검증한다.
- frontend unit suite, typecheck와 production build가 통과했다.
- 1440×900 desktop과 narrow viewport에서 tabs, selected change, cached/stale/disconnected,
  add repository와 refresh state를 실제로 조작했다.
- debug macOS app bundle에서 local repository 등록/refresh와 local/SSH 두 탭 전환을
  smoke했다.
- machine-local SSH smoke matrix가 통과했다. 실제 identity, path와 raw output은 tracked
  artifact에 포함하지 않았다.
- 최종 source of truth는 `docs/ARCHITECTURE.md`, `docs/status.md`와 `scripts/check.sh`다.
