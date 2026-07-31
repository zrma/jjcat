# Spec: ai-first-adoption

Status: completed

## Goal

- public AI-first core를 immutable commit으로 pin하고 jjcat의 product, transport,
  mutation과 verification contract를 repository-owned overlay로 보존한다.

## Context

- 기존 harness는 공통 자율성/검증 규칙과 model-specific baseline을 저장소마다
  복제한다. versioned core/profile과 repository overlay를 분리해 drift와 갱신 범위를
  명확하게 한다.

## Scope

- `.ai-first.toml`, repository overlays, content-addressed lock와 standalone checker
- generated `AGENTS.md`와 `docs/agent-harness.md`
- canonical harness/native gate에 generated drift check 연결

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- framework source는 public immutable commit과 clean checkout으로 검증한다.
- 제품 기능, release artifact, remote bookmark와 updater key 경계는 변경하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | `python3 .ai-first/check.py` | immutable source revision, input/output drift 검증 |
| C2 | done | `scripts/check-agent-harness-interface.sh` | AI-first interface와 jjcat overlay 보존 |
| C3 | done | `scripts/check.sh` | frontend/Rust/native canonical gate 무회귀 |

## Required Evidence

- `.ai-first.lock`이 공개 framework commit과 content digest를 고정한다.
- standalone/generated interface와 repository publication checker가 통과했다.
- frontend 147 tests, production build, Rust unit/integration와 script tests를 포함한
  canonical `scripts/check.sh`가 통과했다.

## Publication Impact

- 공개 tracked artifact에 추가되는 내용과 local-only evidence 경계를 적는다.
- framework public identity와 revision은 공개 가능하다.
- local workspace path, sibling inventory와 raw command output은 기록하지 않는다.
- 이 change에서는 remote write, release와 deploy를 수행하지 않는다.

## Out Of Scope

- 제품 기능, dependency, release와 runtime 변경
- history rewrite, remote push, tag와 release

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과한다.
