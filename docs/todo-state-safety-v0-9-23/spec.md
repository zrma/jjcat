# Spec: state-safety-v0-9-23

Status: active

## Goal

중복 실행에서 등록 정보를 보호하고 전체 펼침 뒤 선택 이동이 행과 경계를 바꾸지 않도록 수정해 v0.9.23 beta로 배포한다.

## Context

재시작 관찰 중 동시 인스턴스와 registry 손상이 발견됐으며 기동 원인은 미확정이다.
선택 주변 임시 노출 상태에서 Show all 후 경계 왕복 시 296 shown/3 hidden과 295 expanded가 바뀌는 경우를 재현했다.

## Scope

단일 앱 인스턴스와 기존 창 활성화, registry process ownership과 atomic save,
선택과 독립적인 전체 구간 펼침, 회귀 테스트와 browser/native 검증, beta release/updater 검증.

## Impact

앱 등록 정보와 history 탐색의 안정성을 개선한다.

## Constraints

저장소 코드·history를 변경하지 않는다. 기존 registry schema, 부분 펼침·Collapse·paging 계약을 보존한다.
개인 정보와 native 진단은 local-only로 유지한다. 이전 버전은 새 lock을 준수하지 않으므로 첫 전환은 동시 실행 없이 검증한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| S1 | todo | Rust process tests, native app | 중복 실행 거절·기존 창 활성화·종료 후 재기동 |
| S2 | todo | Rust tests | registry 배타 소유·충돌 시 무변경·owner 종료 후 재획득·atomic save |
| H1 | todo | frontend tests, browser/native | 임시 anchor 상태에서 전체 펼침 후 경계 왕복 시 행·control 안정 |
| H2 | todo | frontend tests | 부분 펼침·Collapse·reference 경계·page append 유지 |
| R1 | todo | scripts/check.sh, publication gates | canonical/public boundary와 diff review |
| R2 | todo | CI, release verifier, native | same-SHA CI, 공개 asset, updater 설치·재시작·회귀 검증 |

## Implementation Findings

- macOS 기본 single-instance plugin의 비동기 socket bind가 동시 cold launch에서 경쟁했다.
  registry 잠금은 손상을 막았지만 이후 실행의 기존 창 전달이 실패했다. macOS는 OS lease
  확보 뒤 stale socket 정리·동기 bind를 수행하는 좁은 native plugin으로 보완한다.

## Required Evidence

합성 regression, 실제 렌더링/설치 동작, source/artifact provenance와 terminal CI.

## Publication Impact

public-ready source와 일반화한 검증 결과, v0.9.23 notes를 공개한다.

## Out Of Scope

다른 OS 배포, Developer ID/notarization, unrelated repository mutation, 기존 손상 데이터 자동 추정 복구.

## Completion Rule

acceptance를 검증하고 architecture/status/completed로 이관한 뒤 active packet을 제거한다.
