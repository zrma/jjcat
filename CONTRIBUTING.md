# Contributing to jjcat

`jjcat`은 pre-alpha 단계다. 현재 구현 우선순위와 acceptance는 `docs/status.md`,
`docs/roadmap.md`, 활성 `docs/todo-*/spec.md`가 소유한다.

## Before You Start

1. `AGENTS.md`, `docs/agent-harness.md`, `docs/HANDOFF.md`를 읽는다.
2. 기존 작업과 active milestone을 확인한다.
3. 기능이나 architecture 변경은 현재 todo acceptance와 연결한다.
4. security-sensitive report는 public issue 대신 `SECURITY.md`를 따른다.

## Change Contract

- 하나의 change는 독립적으로 설명하고 검증할 수 있는 한 목적만 가진다.
- planned 기능을 implemented로 문서화하지 않는다.
- local/SSH 예시는 실제 host, path, credential 대신 합성 값을 사용한다.
- 전체 gate는 repository root에서 `scripts/check.sh`로 실행한다.
- change description은 `<type>: <summary>` 형식을 사용한다.

## AI-assisted Contributions

AI 도구 사용 여부와 무관하게 contributor가 결과를 검토하고 test evidence를 제공할 책임이
있다. prompt, chat transcript, memory, raw tool log, private repository/host inventory를
issue, pull request, fixture 또는 tracked 문서에 첨부하지 않는다. AI 출력 자체는 테스트나
동작 증거를 대체하지 않는다.

## Publication Boundary

모든 tracked content는 public으로 간주한다. 제출 전 `docs/PUBLICATION.md`와
`scripts/check-publication-boundary.py`를 적용한다. 실제 secret이나 private identifier를
발견했다면 내용을 복사해 public issue로 보고하지 말고 `SECURITY.md`의 private reporting
경로를 사용한다.

## Contribution License

별도 합의가 없는 한 프로젝트에 제출한 contribution은 Apache License 2.0 조건으로
제공하는 데 동의한 것으로 본다.
