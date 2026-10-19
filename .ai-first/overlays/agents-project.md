## Repository Overlay

- 개발 저장소의 `main`은 선형 이력을 유지한다. 동시 변경이나 stale push를 merge로
  우회하지 않으며 후보 history 검사와 task-owned 임시 사본 회수를 출고·마감 조건으로
  확인한다. 계약과 명령은 `docs/VCS_WORKFLOW.md`가 소유한다.
- 구현 여부는 code, test와 user-visible smoke가 기준이며 planned 기능을 implemented로
  표시하지 않는다.
- local과 SSH transport는 같은 Repository Driver domain contract를 사용하고,
  credential과 private host inventory는 tracked artifact에 기록하지 않는다.
- remote command는 shell 문자열 결합이 아니라 구조화된 argv/stdin 경계를 사용하고
  output을 bounded한다.
- mutation은 repository별로 직렬화하고 opaque single-use preview, operation ID
  precondition, execute 직전 stale recheck와 undo path를 검증한다.
- 전체 local gate는 `scripts/check.sh`, generated drift check는
  `python3 .ai-first/check.py`, publication gate는
  `scripts/check-publication-boundary.py`다.
