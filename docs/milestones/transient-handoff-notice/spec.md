# Spec: Transient Handoff Notice

Status: completed

## Goal

- Repository/file handoff와 path copy 성공 알림을 짧은 수명의 transient notice로 표시해
  완료된 action 문구가 workspace 상단에 영구 잔류하지 않게 한다.

## Context

- `v0.9.14`의 `handoffNotice`는 successful repository handoff, file handoff와 path copy에서
  문자열을 설정하지만 값을 해제하는 lifecycle이 없다.
- 성공 알림은 실행 결과를 잠깐 확인하는 feedback이지 repository health나 지속적인 작업
  상태가 아니므로 warning/activity surface와 독립적으로 자동 만료돼야 한다.

## Scope

- notice state에 monotonically increasing sequence를 부여한다.
- 새 notice마다 4초 만료 lifecycle을 시작하고 이전 timer를 정리한다.
- 같은 문구를 연속 실행해도 sequence를 갱신해 마지막 action부터 만료 시간을 다시 계산한다.
- 오래된 expiry가 더 최신 notice를 지우지 않도록 exact sequence를 확인한다.
- repository/file handoff와 path copy가 공통 transient notice contract를 사용한다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- repository error, recovery, refresh waiting과 mutation notice의 lifecycle은 변경하지 않는다.
- native Finder/VS Code/terminal launch와 clipboard contract를 변경하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | focused unit test | show/expire와 stale expiry protection을 검증한다. |
| C2 | done | Browser interaction | 성공 notice가 즉시 보이고 4초 뒤 사라지며 동일 action이 timer를 갱신한다. |
| C3 | done | production build | framework overlay, console error와 layout regression이 없다. |
| C4 | done | `scripts/check.sh` | frontend, Rust와 repository/publication contract가 통과한다. |
| C5 | done | signed release verification | `v0.9.15` same-SHA CI, 6개 asset와 rolling updater manifest를 검증한다. |

## Required Evidence

- transient notice reducer focused test
- rendered same-action restart와 auto-dismiss interaction evidence
- canonical repository gate와 Apple Silicon native artifact smoke
- signed tag, terminal CI/Release와 fresh public updater artifact verification

## Evidence

- focused reducer test는 같은 문구의 sequence 갱신, exact expiry와 stale expiry 무시를
  검증했다.
- local fixture에서 같은 Finder action을 2.5초 간격으로 반복했다. 첫 timer 기준 4초를
  넘긴 시점에도 최신 notice가 유지되고, 두 번째 action 기준 4초 뒤에는 사라졌다.
- 1280×720 rendered surface에서 root overflow와 framework overlay가 없고 clean-load console
  warning/error가 없었으며 production build가 통과했다.
- `scripts/check.sh`에서 standalone/generated/publication contract, 35개 frontend test file의
  185개 test, production build, Rust unit 78개와 integration 7개, updater와 Python gate가
  통과했다. machine-local SSH smoke 2개와 external packaged-updater test 1개는 설계대로
  fixture/asset가 없어 ignored다.
- Apple Silicon release build에서 `0.9.15` app/DMG를 생성했다. 바깥 app과 DMG 내부 app은
  모두 `codesign --verify --deep --strict`를 통과했고 arm64, ad-hoc hardened runtime,
  `TeamIdentifier=not set` 경계를 확인했다. DMG의 `/Applications` shortcut도 정상이다.
- release commit `ebd4dcea`와 GPG-signed `v0.9.15` tag가 같은 revision을 가리킨다.
  main CI `31118278632`, tag CI `31119523159`와 Release `31119523195`는 terminal
  success로 종료됐다.
- draft가 아닌 prerelease에 6개 asset이 게시됐다. fresh download의 SHA256SUMS,
  updater Minisign, ZIP/DMG/tar 내부 app의 arm64/ad-hoc strict signature를 검증했고,
  rolling `updater-beta` manifest가 `0.9.15` versioned manifest와 byte-for-byte 일치한다.

## Publication Impact

- public-ready frontend, focused test, version/release metadata와 product documentation을 변경한다.
- screenshot, browser log와 fixture repository content는 local-only다.
- 사용자 승인에 따라 `v0.9.15` signed tag와 Apple Silicon macOS prerelease를 게시한다.

## Out Of Scope

- persistent activity/error/recovery notice의 dismiss 정책
- toast stack, animation 또는 전역 notification system 도입
- native handoff implementation과 clipboard 권한 변경

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 rendered notice lifecycle, 전체 gate와
`v0.9.15` 공개 updater artifact 검증이 통과한다.
