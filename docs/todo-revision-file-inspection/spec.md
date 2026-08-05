# Spec: Revision File Inspection

Status: active

## Goal

- 선택한 revision의 전체 tracked file snapshot을 탐색하고, 파일별 history와 line
  provenance를 jjcat 안에서 확인할 수 있게 한다.

## Context

- 현재 Changes inspector는 선택 revision에서 변경된 파일과 parent 대비 diff만 보여준다.
- 사용자는 Fork의 File Tree와 Blame/Timeline처럼 revision 시점의 전체 tree, 파일 내용,
  파일 변경 history와 각 line의 source change를 한 흐름에서 확인하길 원한다.
- 현재 지원하는 `jj 0.43`은 `file list`, `file show`, `file annotate`와 path-filtered
  `log`를 제공하며, 기존 local/SSH driver는 structured argv, bounded output와 exact fileset
  경계를 이미 공유한다.

## Scope

- Changes와 Operations 옆에 선택 revision의 lazy-loaded `File Tree` inspector를 추가한다.
- 전체 snapshot tree에서 file type, conflict와 selected change의 status를 표시하고 파일을
  선택하면 bounded source content를 표시한다.
- Changes와 File Tree의 file context menu에 `Blame / Timeline…` action을 추가한다.
- 별도 app-owned window에서 path-filtered revision history, grouped line provenance와 선택
  revision의 file content를 함께 표시한다.
- local과 SSH는 같은 typed projection과 stale revision/file membership validation을 사용한다.
- snapshot, content, history와 annotation output은 bounded하며 truncated/binary/conflict state를
  사용자에게 명시한다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- source content와 private repository metadata를 registry/cache 또는 tracked artifact에
  저장하지 않는다.
- commit/change identity와 repository path를 execute 직전에 다시 확인하고 path는 exact
  `root-file` fileset으로 전달한다.
- full graph refresh에는 snapshot, content 또는 annotation을 포함하지 않고 선택 surface에서만
  lazy query한다.
- 기존 Changes diff, Quick Look, context action과 keyboard navigation을 회귀시키지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| R1 | done | Rust unit/integration tests | local/SSH snapshot tree와 bounded source content projection |
| R2 | done | Rust unit/integration tests | path-filtered file history와 grouped line annotation projection |
| R3 | done | frontend unit/build tests | File Tree inspector, source states와 selection/keyboard behavior |
| R4 | done | browser interaction + design QA | context menu에서 Blame/Timeline 창을 열고 revision을 탐색 |
| R5 | done | `scripts/check.sh` | canonical frontend, Rust와 repository/publication gates |
| R6 | todo | signed release verification | `v0.9.12` same-SHA CI, release assets와 rolling updater manifest |

## Required Evidence

- structured argv와 exact fileset, invalid path/revision, output truncation과 parse failure tests
- local fixture와 simulated SSH fixture에서 동일 projection contract
- File Tree, source viewer, Blame/Timeline loading/empty/error interaction tests
- in-app browser의 rendered layout, context-menu entry, revision selection과 console health
- canonical/publication boundary gates, signed change/tag와 fresh release artifact verification

## Validation Evidence

- Rust unit test는 revision/path의 structured argv와 SSH hex encoding, exact fileset,
  bounded JSONL의 incomplete tail, binary와 partial UTF-8 decode를 검증한다.
- driver integration fixture는 같은 repository snapshot, file content, path history와 line
  annotation을 local process와 simulated SSH stdio에서 비교한다.
- frontend unit test는 hierarchical tree ordering, Timeline URL round trip, annotation grouping과
  older projection을 읽은 뒤에도 newer revision을 유지하는 history merge를 고정한다.
- production frontend build와 in-app browser에서 File Tree/source, pointer context menu,
  Blame/Timeline older/newer navigation, 1280/1024px desktop layout과 console health를 확인했다.
- local-only `design-qa.md`는 reference와 implementation을 한 comparison image에서 검토하고
  actionable P0/P1/P2가 없는 `passed`로 닫혔다.
- canonical `scripts/check.sh`는 177개 frontend test, 78개 Rust unit test, local/simulated
  SSH driver와 6개 mutation integration test, repository/publication contract를 통과했다.

## Publication Impact

- public-ready source, tests, product/status/architecture, version metadata와 release note를
  변경한다.
- 사용자 요청에 따라 main push, signed tag, GitHub prerelease와 rolling beta manifest publish를
  포함한다.
- source content, repository path와 browser/native raw evidence는 local-only로 유지한다.

## Out Of Scope

- file edit/save 또는 working-copy restore
- syntax-aware semantic blame, pull request/issue integration과 avatar service
- rename/copy 이전 path를 휴리스틱으로 추정하는 cross-path history
- Developer ID signing/notarization, Intel, Linux와 Windows distribution

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 `v0.9.12` remote main, signed tag, terminal
CI/Release, fresh artifact와 rolling manifest가 같은 release revision으로 검증된다.
