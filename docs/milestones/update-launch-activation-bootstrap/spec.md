# Spec: Update Launch Activation Bootstrap

Status: completed

## Goal

- incoming jjcat version이 이전 버전의 협조 없이 main window를 macOS 전면 app으로
  표시해, 그 기능을 처음 포함하는 update 자체의 restart부터 동작하게 한다.

## Context

- `v0.9.9`는 **Restart to update**를 실행하는 outgoing version이 one-shot marker를
  기록하도록 구현했다.
- 따라서 marker 기능이 없는 `v0.9.8`에서 `v0.9.9`로 update하면 첫 restart에는 marker가
  없고, 새 창이 전면으로 복귀하지 않을 수 있다.
- regular jjcat main app에는 background-only launch mode가 없으므로 main window를
  application launch 때 표시하고 활성화하는 것이 제품 역할과 일치한다.

## Scope

- Tauri native `RunEvent::Ready`는 marker 유무와 관계없이 main window를 `show()`한 뒤
  `set_focus()`한다.
- 별도 diff Quick Look window는 main window presentation을 실행하지 않는다.
- outgoing updater의 marker write를 제거하고 `relaunch()`는 다시 직접 호출한다.
- `v0.9.9`가 남길 수 있는 legacy marker는 incoming main window startup에서 제거한다.
- `v0.9.9` release/status 문서의 bootstrap 적용 경계를 정정하고 `v0.9.10` release를
  게시한다.

## Constraints

- window size, position, maximized state와 diff/layout preference 복원을 유지한다.
- update download와 restart는 계속 사용자 명시 동작이어야 한다.
- 별도 diff window가 main app을 다시 활성화하지 않는다.
- background launch mode를 추가하지 않는다. 향후 추가한다면 activation policy를 다시
  분리한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| B1 | done | native bundle smoke + source review | incoming main window는 marker 없이 show 뒤 focus한다. |
| B2 | done | focused unit test + source review | legacy marker cleanup 실패가 app startup을 막지 않는다. |
| B3 | done | source review + production build | Quick Look은 main window activation path에서 제외된다. |
| B4 | done | `scripts/check.sh` + native bundle smoke | canonical gate와 실제 macOS app launch가 통과한다. |
| B5 | done | signed tag/release verification | `v0.9.10` same-SHA CI, release asset와 rolling manifest가 검증된다. |

## Required Evidence

- marker 없는 native ordered show/focus smoke와 legacy cleanup focused test
- production frontend build와 canonical `scripts/check.sh`
- native `.app` bundle launch/process smoke
- public boundary, signed change/tag, remote SHA, CI/Release와 fresh asset 검증

## Publication Impact

- source, tests, version metadata, corrected `v0.9.9` documentation과 `v0.9.10` release note가
  public-ready tracked surface에 추가된다.
- 사용자 요청에 따라 main push, signed tag와 GitHub prerelease/rolling manifest publish가
  포함된다.

## Out Of Scope

- 이미 게시된 `v0.9.9` asset 교체
- automatic download/restart
- launch-at-login 또는 background-only mode
- Developer ID signing/notarization

## Completion Rule

B1-B5가 evidence와 함께 done이고 `v0.9.10` remote main, tag, terminal CI/Release, fresh
artifact와 rolling manifest가 같은 release revision으로 검증된다.
