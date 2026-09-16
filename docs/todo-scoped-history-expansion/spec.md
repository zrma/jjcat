# Spec: Scoped History Expansion

Status: active

## Goal

클릭한 fold만 펼치고 선택 이동 뒤에도 그 경계와 반대쪽 접힘을 유지한다.

## Context

v0.9.23은 selection이 나눈 두 fold를 원래 reference 구간으로 합쳐 펼치는 회귀를 만들었다.
이전 검증은 확장 범위를 잘못 정의해 반대쪽 hidden 구간 보존을 놓쳤다.

## Scope

- 클릭한 fold의 change ID만 명시적으로 펼친다.
- 선택이 만든 인접 context anchor를 펼침과 함께 유지하고 양쪽 펼침이 접히면 해제한다.
- Show more, Collapse, paging 및 historyKey reset의 기존 경계를 유지한다.
- v0.9.24 Apple Silicon beta 배포와 updater 설치를 검증한다.

## Impact

history folding의 화면 상태만 바뀐다. repository mutation과 registry 저장 형식은 변경하지 않는다.

## Constraints

반대쪽 hidden change를 노출하지 않는다. 기존 명시적 펼침을 임의로 접지 않는다.
원래 개수 변동 회귀도 재발하지 않도록 검사한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | focused history tests | 선택으로 나뉜 위/아래 fold를 독립적으로 펼친다 |
| C2 | done | focused history tests | 선택 경계 왕복, 부분 펼침, 양쪽 펼침 뒤 단일 Collapse, append를 유지한다 |
| C3 | todo | browser/native smoke | 실제 렌더링과 방향키 focus, filter reset 검증 |
| C4 | done | scripts/check.sh and publication gates | canonical 검사와 focused review |
| C5 | todo | CI, public artifacts, native updater | v0.9.24 배포·설치 검증 |

## Required Evidence

기존 코드에서 scoped regression 실패를 확인했다. 수정 후 focused 18 tests와 browser의
위/아래 독립 펼침·Collapse·방향키 focus·filter reset은 통과했다. 독립 리뷰의 upper partial
경계 조기 해제를 수정했고 추가 상호작용 조합 검사에서 blocker가 없었다. native 상호작용,
release 동일 SHA CI 및 공개 asset 검증. raw 로그와 실제 저장소 정보는 local-only다.

## Publication Impact

제품 코드·합성 테스트·일반화된 계약과 release note만 게시한다.
main, signed v0.9.24 tag와 beta updater 배포는 승인된 범위다.

## Out Of Scope

registry 재설계, 새로운 folding UX, 검색 범위 확장, 다른 OS 배포.

## Completion Rule

모든 acceptance를 검증하고 결과를 architecture/status/completed-milestones로 이관한 뒤 packet을 제거한다.
