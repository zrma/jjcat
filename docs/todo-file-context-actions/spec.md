# Spec: File Context Actions

Status: active

## Goal

- Working Copy와 하단 Changes file tree에서 파일을 우클릭하면 선택된 행 가까이에 compact
  context menu가 나타나고, 자주 쓰는 file action을 현재 맥락을 잃지 않고 실행한다.

## Context

- 현재 file row는 click selection, arrow navigation과 Space Quick Look을 제공하지만 pointer
  context action은 없다.
- repository와 change에는 app-owned context menu가 이미 있으므로 file action도 같은 dark
  desktop surface와 close/focus contract를 재사용한다.
- reference screenshot의 native menu density와 grouping을 따르되 jjcat이 실제 보장하는
  diff, VS Code, Finder, split과 copy action만 노출한다.

## Scope

- 우클릭한 file row를 먼저 선택하고 pointer 위치에 viewport-bounded menu를 연다.
- keyboard Context Menu key와 `Shift+F10`도 focused file row에서 같은 menu를 연다.
- `Open Diff`, `Open in VS Code`, `Show in Finder`, `Split This File…`, `Copy Path`를 제공한다.
- Finder reveal은 local repository에서만 활성화하고 SSH에서는 이유가 드러나는 disabled
  state로 유지한다.
- editor/reveal target은 validated repository-relative path를 구조화된 argv로 넘긴다.
- split은 기존 mutation preview/dialog를 exact single-file path로 시작한다.

## Constraints

- folder row에는 file action menu를 열지 않는다.
- context menu를 열기 위해 추가 확인이나 command typing을 요구하지 않는다.
- file split은 기존 preview, stale recheck와 `jj op` recovery contract를 우회하지 않는다.
- local absolute root, SSH host/path와 raw command는 tracked artifact나 preview에 노출하지
  않는다.
- current diff selection, keyboard navigation과 Quick Look 동작을 유지한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| F1 | done | rendered pointer + keyboard smoke | 두 file tree에서 우클릭한 file을 선택하고 bounded menu를 연다. |
| F2 | done | rendered interaction smoke | menu dismiss, hover/focus, Escape와 enabled/disabled state가 일관된다. |
| F3 | done | frontend test + mutation dialog smoke | single-file split이 exact path로 기존 preview flow를 연다. |
| F4 | done | Rust unit test + native bundle smoke | local/SSH editor와 local Finder handoff가 validated structured argv를 사용한다. |
| F5 | done | `scripts/check.sh` + design QA | canonical gate와 reference-driven visual QA가 통과한다. |

## Required Evidence

- context menu position/action model focused test
- file handoff path validation과 platform/transport plan Rust test
- Working Copy와 inspector Changes rendered interaction screenshot
- production build와 canonical `scripts/check.sh`

## Validation Evidence

- `changeActions.test.ts`는 context menu split이 선택한 exact path 하나만 기존 mutation
  dialog로 전달하고 root change를 비활성화하는 contract를 검증한다.
- `popupPosition.test.ts`는 pointer menu가 viewport 우하단을 벗어나지 않도록 clamp되는
  위치 계산을 검증한다.
- Rust handoff test는 local/SSH editor와 platform별 local reveal argv, repository-relative
  path validation 및 SSH reveal 거부를 검증한다.
- rendered local/SSH fixture에서 Changes와 Working Copy 우클릭, `Shift+F10`, single-file
  split form, path copy feedback와 SSH Finder disabled state를 확인했다.
- production Tauri app bundle은 arm64로 생성됐고 ad-hoc signature strict verification을
  통과했다.
- canonical `scripts/check.sh`와 `design-qa.md`가 통과했다.

## Publication Impact

- source, tests, repository contract와 durable status가 public-ready tracked surface에 추가된다.
- 이번 slice는 push, tag와 release를 수행하지 않는다.

## Out Of Scope

- installed application enumeration과 nested Open With submenu
- external diff tool discovery
- historical blame/timeline browser
- save-as 또는 arbitrary revision restore

## Completion Rule

F1-F5가 evidence와 함께 done이고 두 file list surface의 pointer/keyboard behavior와 native
file handoff가 검증된다. publish 전에는 active todo를 유지한다.
