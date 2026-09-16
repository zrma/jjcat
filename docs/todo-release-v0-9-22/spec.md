# Spec: release-v0-9-22

Status: active

## Goal

검증된 history pagination을 Apple Silicon beta v0.9.22로 출고하고 updater 설치와 native 동작을 검증한다.

## Context

로컬 구현의 계약과 검증은 docs/ARCHITECTURE.md와 docs/completed-milestones.md가 소유한다.
현재 배포판은 v0.9.21이다.

## Scope

버전 정합성, release notes, public boundary, main/tag CI와 release workflow, 공개 asset 검증,
rolling updater, 실제 설치와 history 추가 로딩 smoke, 최종 handoff 정리.

## Impact

macOS beta 채널과 사용자의 설치된 앱에 history 추가 로딩 기능을 제공한다.

## Constraints

ad-hoc/hardened runtime/arm64와 Minisign updater 계약을 유지한다. 기존 repository state와
history를 재작성하지 않는다. private inventory와 raw 검증 로그는 tracked하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| R1 | todo | scripts/check.sh | 버전·문서·canonical gate |
| R2 | todo | publication gates, GitHub runs | main/tag 동일 SHA CI와 release 완료 |
| R3 | todo | scripts/verify-macos-release.sh | fresh public asset 6개와 updater manifest 검증 |
| R4 | todo | native app | updater 설치, binary 일치·서명과 추가 history 탐색 |
| R5 | todo | remote state, CI | docs 이관·active packet 제거·clean working copy |

## Required Evidence

repository gate, 권한 있는 machine-local gate, remote SHA, terminal CI, public artifact와 native smoke.

## Publication Impact

source, release notes와 합성 검증 판정만 게시한다. private credential과 기기 정보는 기록하지 않는다.

## Out Of Scope

새 제품 기능, Developer ID/notarization, 다른 OS, unrelated repository mutation.

## Completion Rule

모든 acceptance를 확인하고 status/handoff/completed-milestones로 이관한 뒤 active packet을 제거한다.
