# Spec: diff-readability

Status: completed

## Goal

- side-by-side diff의 Before/After를 한 흐름으로 탐색하고 교체 줄의 실제 변경 구간을
  unified와 side-by-side 양쪽에서 빠르게 식별한다.

## Context

- `v0.9.4`까지 side-by-side의 두 pane은 overflow를 서로 격리했지만 가로 위치도
  독립적이어서 같은 긴 줄을 비교하려면 scrollbar를 두 번 조작해야 했다.
- addition/deletion은 줄 전체 배경만 달라 긴 줄에서 실제로 바뀐 단어나 문자를 찾기
  어려웠다.

## Scope

- 어느 side-by-side pane을 조작해도 반대 pane을 같은 상대 가로 위치로 동기화한다.
- native scroll, 항상 보이는 custom track/thumb와 keyboard navigation이 같은
  synchronization path를 사용한다.
- 인접한 deletion/addition block을 순서대로 짝짓고 단어 단위 변경을 계산한다.
- 충분히 유사한 변경 단어는 문자 단위로 세분화한다.
- 같은 intraline rendering을 unified와 side-by-side 및 모든 메인/별도 diff surface에
  적용한다.

## Constraints

- Before/After의 독립 overflow 경계와 같은 pane 폭을 유지해 긴 한쪽 줄이 반대 pane을
  밀어내지 않는다.
- 서로 다른 scroll range는 absolute pixel이 아니라 bounded relative progress로
  동기화한다.
- 유사도가 낮거나 과도하게 긴 줄은 계산량을 제한하고 기존 whole-line styling으로
  fallback한다.
- diff query, 512 KiB capture limit, local/SSH parity와 저장된 layout/whitespace
  preference를 변경하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| D1 | done | scroll mapping unit test | 서로 다른 overflow range, 시작/끝과 stale bound를 동일한 상대 위치로 계산한다. |
| D2 | done | intraline unit test | 단어 교체, 유사 identifier의 문자 추가, multi-line replacement와 bounded fallback을 검증한다. |
| D3 | done | production frontend build | unified와 side-by-side가 같은 semantic intraline markup을 type-safe하게 렌더링한다. |
| D4 | done | browser interaction smoke | 한 pane의 keyboard scroll 뒤 양쪽 progress가 같고 두 layout에서 변경 단어만 강조된다. |
| D5 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |

## Required Evidence

- synchronized scroll mapping과 intraline segmentation focused unit tests
- production TypeScript/Vite build
- nonblank/overlay-free demo와 console health를 포함한 browser interaction smoke
- canonical repository 및 publication boundary gates
- signed release tag, same-SHA terminal CI/Release workflows와 fresh artifact verification

## Publication Impact

- public-ready frontend, test, version metadata와 product/release documentation을 변경한다.
- `v0.9.5` Apple Silicon macOS beta로 tag-triggered prerelease와 rolling beta manifest를
  게시한다.
- updater private key와 password는 기존 GitHub Actions secret 경계에만 남긴다.

## Out Of Scope

- vertical scroll synchronization
- moved-block detection 또는 syntax-aware language parser
- repository별/file별 diff rendering preference
- Developer ID signing/notarization, Intel, Linux와 Windows distribution

## Completion Rule

focused unit test, user-visible browser interaction, canonical/publication gates, signed tag와
same-SHA terminal CI/Release artifact 검증이 모두 통과한다.
