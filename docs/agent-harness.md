# Agent Harness

## Interface

- Structure ID: `agent-harness-v1`.
- Baseline ID: `openai-gpt-5.6-2026-07-11`.
- Convergence stage: `canonical`.
- Target stage: `canonical`.
- Canonical check: `scripts/check-agent-harness-interface.sh`.
- Publication class: `public`.
- Publication boundary check: `scripts/check-publication-boundary.py`.

`AGENTS.md`가 공통 GPT-5.6 계약을 소유하고, 이 문서는 jjcat product, local/SSH
transport와 current milestone로 가는 canonical 진입점이다.

Publication class는 live remote visibility가 아니라 tracked artifact의 `public-ready`
content 기준을 선언한다. remote가 없거나 private여도 repository gate는 public 기준으로
실행한다. public remote 생성, visibility의 public 전환 또는 공개 push 전에는 live
identity/visibility를 확인하고 권한 있는 machine-local inventory gate를 추가로 실행한다.
license 선택도 remote visibility와 별개의 결정이다.

Tracked artifact contract: raw tool output와 정확한 로컬 환경 evidence는 local-only로
취급한다. 공개 가능한 기록에는 repository-owned 결정, 필요한 명령 이름, redacted
검증 판정만 남기고 path, host, address와 credential은 placeholder로 바꾼다.

## Project Objective

로컬과 Remote SSH의 여러 Jujutsu 저장소를 한 window에서 즉시 전환하고 change graph,
diff와 안전한 history shaping을 수행하는 local-first desktop experience를 제공한다.

## Source Of Truth

- 사용자 문제와 MVP 경계: `docs/PRODUCT.md`.
- component, transport와 security boundary: `docs/ARCHITECTURE.md`.
- 현재 구현과 리스크: `docs/status.md`; 우선순위: `docs/roadmap.md`.
- 무컨텍스트 시작점: `docs/HANDOFF.md`; 현재 작업: 활성 `docs/todo-*/`.
- 공개 기록과 최초 publication 계약: `docs/PUBLICATION.md`.
- 검증 선언: `docs/REPO_MANIFEST.yaml`과 `scripts/check.sh`.

## Autonomy And Permissions

- 목표와 acceptance가 명확한 local, reversible 작업은 추가 승인 없이 구현, 검증,
  문서화와 local `jj` change 정리까지 진행한다.
- external write, secret, 비용, 파괴적 작업, trust/product 방향 변경, published history
  rewrite와 승인되지 않은 push는 에스컬레이션한다.
- 실제 private host나 credential 없이도 fixture와 transport boundary로 진행 가능한
  작업은 agent가 직접 결정한다.
- public artifact에는 agent prompt, 대화 transcript, memory, raw tool output을 남기지 않고
  repository-owned decision, test와 redacted evidence만 남긴다.

## Execution Loop

1. `jj status`, handoff, status/roadmap와 활성 todo를 확인한다.
2. registry, local driver, SSH driver, projection, desktop shell 중 논리 경계를 고정한다.
3. 비사소한 작업은 `scripts/start-work.sh --work-id <work-id>`로 acceptance, publication
   impact와 질문을 고정한다.
4. fixture 또는 failing test를 먼저 만들고 가장 작은 vertical slice를 구현한다.
5. focused test, local/SSH transport smoke와 `scripts/check.sh`까지 넓힌다.
6. durable 상태만 status, roadmap, completed milestone 또는 todo에 반영한다.
7. 하나의 목적을 가진 local `jj` change로 닫고 external write 전에는 승인을 받는다.

## Verification And Evidence

- 전체 local gate: `scripts/check.sh`.
- harness interface: `scripts/check-agent-harness-interface.sh`.
- repository contract: `scripts/check-repository-contract.py`.
- publication boundary: `scripts/check-publication-boundary.py`.
- transport 변경은 local fixture, simulated SSH fixture와 cancel/timeout/redaction test를 요구한다.
- UI 변경은 representative repository data를 사용한 rendered state와 keyboard/pointer smoke를 요구한다.
- mutation 변경은 operation precondition, success, stale input, failure와 undo evidence를 요구한다.
- 최종 evidence에는 acceptance별 명령, user-visible 결과, 남은 risk와 local/remote
  bookmark 상태를 구분해 포함한다.
- tracked 문서 변경은 Markdown link, public class 정합성과 local-only artifact 노출을
  repository gate로 확인한다.

## Escalation

`docs/ESCALATION_POLICY.md`를 기준으로 product/trust 선택, credential/private context,
비용, 파괴적 변경, remote helper installation, published history rewrite와 승인되지 않은
push가 필요할 때만 사용자에게 최소 판단을 요청한다.

## VCS And Publish

- local VCS는 `jj`를 사용하고 change description은 `<type>: <summary>`와 Codex
  attribution trailer 규칙을 따른다.
- change는 independently explainable하고 검증 가능한 milestone 단위로 유지한다.
- push, tag, release, remote 생성과 license는 별도 external decision/write 경계다.
- public content class는 remote가 private여도 유지한다. private remote push는 repository
  gate를 통과해야 하며, public 생성·전환·push 직전에는 live remote identity/visibility와
  reachable history를 포함해 repository gate와 권한 있는 machine-local inventory gate를
  모두 통과한다.
- AI-assisted change description은 configured attribution을 유지하되 prompt, transcript와
  local execution context를 commit message나 release note에 복사하지 않는다.

## Harness Evaluation And Improvement

대표 multi-repository session에서 완료성, repository switch latency, stale-state
명확성, graph/diff 정확도, SSH failure recovery와 mutation safety를 평가한다. 반복 실패는
가장 가까운 unit, integration, rendered smoke, gate 또는 concise operating rule에
기계화한다.

## Convergence

- `bridge`: 이 문서가 공통 interface를 제공하고 기존 상세 문서를 연결한다.
- `normalized`: autonomy, execution, verification, escalation과 VCS 정책을 동일 section
  contract로 이동한다.
- `canonical`: product invariant는 local content로 유지하고 공통 baseline, heading
  order와 check skeleton을 잠근다.
- 단계 전환은 현재 저장소의 Structure ID, 섹션 순서, canonical check 결과로 검증하며 다른 저장소의 이름·개수·로컬 경로·공개 여부를 전제하지 않는다.

## Project Overlay

- planned 기능을 구현됨으로 기록하지 않고 code, test와 user-visible smoke를 source of truth로 삼는다.
- credential과 private host inventory는 tracked artifact, fixture와 CI에 넣지 않는다.
- public issue, fixture와 snapshot에는 실제 repository name, host alias, username, path와
  operation ID 대신 합성되고 재현 가능한 값을 사용한다.
- remote command는 shell 문자열 결합 없이 argv/stdin으로 실행하고 output을 bounded한다.
- 기본 transport는 listening port 없는 OpenSSH stdio이며 helper는 evidence가 있을 때만 추가한다.
- mutation은 repository별로 직렬화하고 operation ID precondition과 undo path를 검증한다.

## Related Documents

- Navigation: `docs/HANDOFF.md`.
- Product and architecture: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`.
- Current state and direction: `docs/status.md`, `docs/roadmap.md`.
- Completed work: `docs/completed-milestones.md`.
- Publication policy: `docs/PUBLICATION.md`.
- Active work: `docs/todo-p1-multi-repository-cockpit/`.
- Declared checks: `docs/REPO_MANIFEST.yaml`.
