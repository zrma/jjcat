# Spec: File Timeline Loading Continuity

Status: completed

## Goal

- File Blame/Timeline에서 revision을 이동할 때 기존 line provenance를 유지하고, 새
  projection이 준비되면 한 번에 교체해 전체 화면 깜빡임을 없앤다.

## Context

- `v0.9.13`은 `loading`일 때 세 번째 window row 전체를 `Loading line provenance…` 상태로
  교체한다. local에서는 짧고 SSH에서는 더 긴 빈 화면이 반복돼 timeline 탐색 흐름이 끊긴다.
- 초기 window load에는 아직 보존할 projection이 없으므로 기존 중앙 loading 상태가 맞다.

## Scope

- 최초 load와 revision refresh를 구분하는 deterministic presentation state
- refresh 중 기존 text/binary/empty projection을 그대로 유지하는 content container
- layout을 밀지 않는 compact progress overlay와 stale projection을 명시하는 error feedback
- loaded projection 기준 current provenance 표시와 accessibility busy/status semantics
- window lifetime에 한정된 bounded LRU projection cache와 동일 revision in-flight deduplication
- 현재 projection의 immediate older/newer revision을 background에서 한 번씩 prefetch

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- local/SSH driver query, 200-entry history limit와 selection/navigation contract를 바꾸지 않는다.
- 새 projection을 미리 추정하거나 source content를 client cache에 추가로 영속화하지 않는다.
- background prefetch는 최대 두 이웃으로 제한하고 실패를 foreground error로 승격하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | focused unit test | initial loading과 projection-preserving refresh/error 상태 |
| C2 | done | focused unit test | bounded LRU, in-flight dedup과 immediate neighbor selection |
| C3 | done | rendered interaction | uncached 전환은 provenance 유지, prefetched 전환은 즉시 표시 |
| C4 | done | production build | layout shift, framework overlay와 console error 없음 |
| C5 | done | `scripts/check.sh` | frontend, Rust와 repository/publication contract |
| C6 | done | signed release verification | `v0.9.14` same-SHA CI, 6개 asset와 rolling updater manifest |

## Required Evidence

- deterministic presentation-state unit test
- cache hit/dedup/eviction과 immediate neighbor unit test
- delayed revision response를 사용하는 uncached/cached browser interaction과 DOM/screenshot evidence
- canonical repository gate

## Evidence

- focused file timeline test 10건이 presentation state, immediate neighbor 선택, in-flight
  dedup, cache reuse와 bounded LRU eviction을 검증했다.
- delayed fixture의 uncached 전환에서 기존 provenance surface와 content bounds가 유지되고
  compact activity만 겹쳐 표시됐다. prefetched neighbor는 busy state 없이 즉시 전환됐다.
- 기본 및 native minimum-width viewport에서 root overflow, framework error overlay와 clean-load
  console error가 없었고 production build가 통과했다.
- canonical gate는 frontend 183건, Rust unit 78건, integration 7건과 repository/publication
  contract를 통과했다.
- GPG-signed `v0.9.14` tag는 release change와 같은 commit을 가리키고 main/tag CI 및 macOS
  Release workflow가 성공했다. fresh public asset 6개는 checksum, updater signature, arm64
  ad-hoc/hardened-runtime app bundle과 DMG 구조 검증을 통과했으며 rolling manifest와
  byte-for-byte 일치한다.

## Publication Impact

- public-ready frontend, focused test, product/release documentation과 version metadata를 변경한다.
- screenshot, browser log와 fixture repository content는 local-only다.
- 사용자 승인에 따라 `v0.9.14` signed tag와 Apple Silicon macOS prerelease를 게시하고,
  versioned updater asset 및 rolling beta manifest까지 검증한다.

## Out Of Scope

- backend query 최적화와 process-level 또는 persistent annotation/history cache
- timeline marker, clustering, driver projection 또는 updater 변경

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 rendered revision transition, 전체 gate와
`v0.9.14` 공개 updater artifact 검증이 통과한다.
