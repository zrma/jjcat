# Spec: history-keyboard-focus

Status: active

## Goal

change를 클릭한 뒤 방향키로 이동하면 선택과 실제 키보드 포커스가 같은 행을 가리킨다.

## Context

방향키는 selection만 바꾸므로 이전 클릭 행에 focus ring이 남고 Enter가 이전 행을 재선택한다.

## Scope

graph 방향키 navigation, selection 후 DOM focus, 가상 스크롤 경계와 patch beta 배포.

## Impact

현재 선택을 표시하는 행과 Enter 입력 대상이 일치한다. repository mutation은 변경하지 않는다.

## Constraints

- v0.9.19의 명시적 history 펼침 보존, 선택 가시성과 bounded virtualization을 유지한다.
- search, file/diff/operation view와 dialog의 포커스를 빼앗지 않는다.
- focus ring을 전역으로 제거하지 않고 키보드 접근성을 유지한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | rendered regression | 클릭→방향키→Enter에서 focus와 selection 일치 |
| C2 | done | rendered regression | 접힌 행과 가상 window 경계에서도 포커스 일치 |
| C3 | done | rendered regression | 검색·fold control·다른 panel 포커스 보존 |
| C4 | done | scripts/check.sh | canonical gate와 macOS build 통과 |
| C5 | todo | CI + artifact + native | v0.9.20 beta와 updater 설치 검증 |

## Required Evidence

수정 전후 browser 재현, native focus/selection smoke, public artifact와 설치 버전 검증.

## Publication Impact

합성 fixture와 제품 계약만 기록한다. runtime 원문은 local-only로 둔다.

## Out Of Scope

hover 스타일 변경, backend·transport·mutation 변경, 다른 OS 배포.

## Completion Rule

검증 결과·제한을 architecture, completed milestones와 release 문서에 이관하고 packet을 제거한다.
