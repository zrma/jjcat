# Spec: diff-viewer-preferences

Status: completed

## Goal

- 메인 창과 별도 창의 모든 diff viewer가 layout과 whitespace 선택을 공유하고 앱 재시작
  및 in-app update restart 뒤에도 복원한다.

## Context

- unified/side-by-side 선택은 메인 창에서만 영구 저장됐고 whitespace는 실행마다
  `Show all`로 초기화됐다.
- 별도 diff window는 열 때의 선택값만 전달받아 그 창에서 바꾼 값이 메인 창이나 다음
  실행에 반영되지 않았다.

## Scope

- preserve/ignore-all whitespace mode를 app-owned local preference에 저장한다.
- 메인 창의 기존 unified/side-by-side preference와 whitespace preference를 하나의
  shared React state contract로 제공한다.
- Tauri app event와 browser storage event로 메인 창과 별도 diff window의 변경을 양방향
  동기화한다.
- 별도 window URL의 현재 mode는 local storage가 unavailable할 때의 fallback으로 유지한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| D1 | done | preference unit test | valid layout/whitespace를 복원하고 invalid/storage failure는 안전한 fallback을 사용한다. |
| D2 | done | shared-event unit test | malformed cross-window payload를 무시하고 두 preference field를 독립적으로 전달한다. |
| D3 | done | browser interaction smoke | 메인 창 선택이 별도 window에 이어지고 별도 window 변경이 메인 창에 즉시 반영된다. |
| D4 | done | browser reload smoke | 별도 window에서 마지막으로 고른 layout/whitespace가 main reload 뒤 복원된다. |
| D5 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |

## Required Evidence

- layout/whitespace valid, invalid, fallback과 storage-failure unit tests
- cross-window preference event payload validation unit tests
- main/separate-window 양방향 mode 변경과 reload 복원 browser smoke
- production frontend build와 canonical repository gate
- native app/DMG package의 code seal, app version, arm64 architecture와 disk image checksum
- signed release tag, same-SHA terminal CI/Release workflows와 fresh artifact verification

## Constraints

- preference failure가 repository cockpit load나 diff 조회를 막지 않는다.
- machine identity, repository content 또는 private inventory를 preference나 tracked
  evidence에 추가하지 않는다.
- diff query의 bounded capture, local/SSH parity와 selected-file-only whitespace reload를
  변경하지 않는다.

## Publication Impact

- public-ready frontend, test, version metadata와 product/release documentation을 변경한다.
- `v0.9.4` Apple Silicon macOS beta로 tag-triggered prerelease와 rolling beta manifest를
  게시한다.
- updater private key와 password는 기존 GitHub Actions secret 경계에만 남긴다.

## Out Of Scope

- repository별 또는 file별 diff preference
- 새로운 diff layout이나 whitespace algorithm
- Developer ID signing/notarization, Intel, Linux와 Windows distribution

## Completion Rule

focused preference test, main/separate-window 양방향 user-visible smoke, canonical local gate,
public boundary gate, signed tag와 same-SHA terminal CI/Release artifact가 모두 통과한다.
