# jjcat

**All your jj repos, one window.**

jjcat은 로컬과 Remote SSH 환경의 여러 Jujutsu 저장소를 한 데스크톱
애플리케이션에서 빠르게 전환하고 살펴보기 위한 local-first repository manager다.

## Product Promise

- 로컬 저장소와 SSH 호스트의 저장소를 동일한 수준의 대상으로 다룬다.
- 저장소 탭과 quick switcher로 컨텍스트 전환 비용을 줄인다.
- Jujutsu change graph, working-copy 상태, diff를 시각적으로 탐색한다.
- mutation은 operation log와 precondition을 활용해 예측 가능하고 되돌릴 수 있게 한다.
- source code, credential, private host inventory를 hosted service로 전송하지 않는다.

## Current Status

Pre-alpha P1 multi-repository cockpit이 동작한다. Tauri desktop shell에서 local/SSH 저장소를
등록하고 persistent tab과 quick switcher로 전환하며, background refresh 상태와 bounded
change history를 조회할 수 있다.

현재 작업은 [P2 Graph and Diff](docs/todo-p2-graph-and-diff/spec.md)다.

## Public Repository Boundary

이 저장소의 tracked content는 remote visibility와 무관하게 공개 가능한 `public-ready`
기준을 적용한다. 제품 계약, 합성 fixture, source code와 재현 가능한 검증 규칙만 기록하고
실제 SSH host, repository checkout path, credential, private inventory, agent 대화·memory·
raw tool log는 기록하지 않는다. 자세한 기준은 [Publication Policy](docs/PUBLICATION.md)에
있다.

[GitHub origin](https://github.com/zrma/jjcat)은 public으로 구성했으며 source code는
Apache License 2.0으로 제공한다.

## Repository Workflow

처음 시작하는 agent는 다음 순서로 읽는다.

1. [AGENTS.md](AGENTS.md)
2. [Agent Harness](docs/agent-harness.md)
3. [Handoff](docs/HANDOFF.md)
4. [Project Status](docs/status.md)
5. [Publication Policy](docs/PUBLICATION.md)
6. 활성 todo의 spec과 open questions

전체 로컬 검증:

```sh
scripts/check.sh
```

개발 실행:

```sh
pnpm install
pnpm tauri dev
```

새 작업 bootstrap:

```sh
scripts/start-work.sh --work-id <work-id>
```

로컬 change 검증과 설명 정리:

```sh
scripts/finalize-change.sh --message "docs: describe the milestone"
```

push, visibility 변경, package publish와 release는 별도 사용자 결정과 publication gate를
요구한다.

기여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md), 보안 이슈 신고 경계는
[SECURITY.md](SECURITY.md)를 따른다.

## License

`jjcat`은 [Apache License 2.0](LICENSE)으로 제공한다.
