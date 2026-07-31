# Spec: repository-rail-scroll

Status: completed

## Goal

- repository가 많은 source에서도 핵심 navigation을 항상 볼 수 있게 하고, repository를
  열 때 사용자가 보고 있던 source 위치가 움직이지 않게 한다.

## Scope

- Repositories heading, Workspace, Repository와 Last Fetched navigation을 rail 상단에
  고정한다.
- Repository Sources와 Standalone 목록만 하나의 독립적인 세로 scroll surface로 묶는다.
- Repository Sources heading은 목록을 스크롤하는 동안 sticky하게 유지한다.
- source repository를 double-click하거나 `Enter`로 열 때 기존 scroll position을 유지한다.

## Constraints

- registry, source discovery, tab selection과 repository open contract는 변경하지 않는다.
- app 전체 또는 workspace content로 wheel overscroll이 전파되지 않게 한다.
- browser scroll anchoring이 source tree 재렌더링 뒤 위치를 보정하지 않게 한다.
- 별도의 restart-persistent preference는 추가하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| R1 | done | rendered layout smoke | rail과 source list가 분리된 overflow boundary를 가진다. |
| R2 | done | pointer interaction smoke | scroll 뒤 repository double-click 전후 위치가 같다. |
| R3 | done | production frontend build | narrow source rail에서 clipping이나 framework overlay가 없다. |
| R4 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |

## Required Evidence

- production TypeScript/Vite build와 frontend tests
- rendered page identity, non-blank state, console health와 screenshot
- source list scroll 전후 고정 navigation 좌표와 root scroll boundary
- repository double-click 전후 동일한 source scroll position
- canonical repository 및 publication boundary gates
- signed release tag, same-SHA terminal CI/Release workflows와 fresh artifact verification

## Publication Impact

- public-ready frontend, version metadata와 product/release documentation을 변경한다.
- `v0.9.7` Apple Silicon macOS beta로 tag-triggered prerelease와 rolling beta manifest를
  게시한다.

## Out Of Scope

- source tree의 scan/discovery 범위 또는 ordering 변경
- scroll position의 quit/relaunch persistence
- Developer ID signing/notarization, Intel, Linux와 Windows distribution

## Completion Rule

rendered pointer interaction, focused/canonical gates, signed tag와 same-SHA terminal CI/Release
artifact 검증이 모두 통과한다.
