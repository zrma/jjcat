# Spec: Registry Recovery And History Control Focus

Status: active

## Goal

잘못된 UTF-8 등록 파일에서 원본을 보존하고 시작을 복구한다. 키보드로 펼치거나 접은
history 구간의 다음 control로 포커스를 이어 간다.

## Context

기존 v0.9.24는 UTF-8 해석 실패를 복구하지 않고 시작 오류로 처리했다. 펼침·접기 버튼을
키보드로 실행하면 DOM에서 제거된 버튼의 포커스가 body로 빠졌다. 두 사례 모두 기존
검토와 테스트가 놓친 경계이며 기준은 v0.9.24 및 현재 main이다.

## Scope

- 등록 파일 바이트 읽기 후 UTF-8/JSON 손상을 기존 corrupt 보존·빈 registry 복구로 처리.
- 키보드 fold activation의 source 위치를 기억하고 가상 window·구간 병합 이후 다음
  control을 찾아 스크롤·렌더링·포커스. control 소멸 시 선택 행으로 복귀.
- v0.9.25 Apple Silicon beta 배포, 공개 asset 검증과 updater 설치.

## Impact

앱 시작 복구와 history 화면의 키보드 흐름만 변경한다. registry schema와 repository
mutation 의미는 유지한다.

## Constraints

잠금·미래 schema 보호와 실제 I/O 오류의 중단을 유지한다. 손상 파일을 수정하거나
기존 backup을 덮어쓰지 않는다. 반대쪽 접힘과 pointer scroll, 다른 panel focus를 유지한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | registry tests | invalid/truncated UTF-8 원본·backup 보존, 정상 재저장, I/O와 미래 schema 보호 |
| C2 | done | focus tests and browser/native smoke | Show more/Show all/Collapse, virtualization, merged control, fallback, pointer 동작 |
| C3 | done | scripts/check.sh and focused review | canonical·generated·publication gate와 독립 리뷰 |
| C4 | todo | same-SHA CI, public assets, updater | v0.9.25 배포·설치와 등록 정보 보존 |

## Required Evidence

기존 UTF-8 테스트 실패를 확인했다. 수정 후 registry 14 tests와 focus target 5 tests를
통과했다. browser에서 Enter/Space 부분 펼침·전체 펼침·Collapse와 가상 window/merged
control focus 및 pointer scroll 보존을 검증했다. 격리 native 앱은 합성 invalid UTF-8을
원본 바이트 그대로 보존하고 빈 registry로 정상 시작했다. 독립 focused review에 추가
finding이 없다. 공개 asset과 설치 앱 검증은 C4에서 닫는다. raw 로그·실제 등록 파일과
사용자 저장소 정보는 local-only다.

## Publication Impact

제품 코드·합성 테스트·일반화된 계약과 release note만 게시한다. main, v0.9.25 tag와
beta updater 배포가 대상이다.

## Out Of Scope

새로운 registry schema, history UX 재설계, 다른 OS 배포, broader dependency refresh.

## Completion Rule

acceptance의 실제 결과와 한계를 소유 문서로 이관하고 active packet과 stale pointer를 제거한다.
