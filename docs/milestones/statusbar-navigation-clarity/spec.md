# Spec: statusbar-navigation-clarity

Status: completed

## Goal

- status bar의 현재 상태 정보와 repository navigation을 분리해 의미가 불명확한
  secondary repository shortcut을 제거하고 `v0.9.17`로 배포한다.

## Context

- status bar 우측은 현재 repository의 jj version/cache age 뒤에 registry 순서상 첫 번째
  다른 repository의 이름과 readiness를 하나의 무표식 button으로 표시한다.
- button은 target 선택 기준과 동작을 설명하지 않으며, 상태 표시처럼 보이지만 실제로는
  repository를 열고 활성화해 사용자에게 예기치 않은 전환으로 느껴진다.
- 상단 repository tab, 좌측 repository navigation과 `Command-K` quick switcher가 이미
  명시적인 전환 surface를 제공한다.

## Scope

- status bar에서 secondary repository 이름/readiness button과 전용 style을 제거한다.
- 현재 repository의 상태, jj version, cache age와 updater action은 유지한다.
- 상단 tab, 좌측 navigation과 `Command-K` quick switcher 동작을 유지한다.
- source/version/release note를 `0.9.17`로 맞추고 Apple Silicon beta/updater를 배포한다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- repository selection domain/transport contract는 변경하지 않는다.
- Developer ID signing/notarization을 새 요구사항으로 만들지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | source inspection + production build | status bar에 secondary repository button/style이 없고 현재 상태 정보와 updater action은 유지된다. |
| C2 | done | rendered desktop/narrow smoke | 임의 repository 이름/readiness가 status bar 우측에 나타나지 않는다. |
| C3 | done | rendered keyboard interaction | `Command-K` quick switcher로 repository를 계속 전환할 수 있다. |
| C4 | done | `scripts/check.sh` + publication gate | canonical과 public-ready contract를 통과한다. |
| C5 | done | remote SHA + terminal CI/Release | signed `v0.9.17` tag와 같은 SHA의 CI/Release가 성공한다. |
| C6 | done | fresh public artifact verification | asset 6개, checksum, updater signature, app bundle/DMG와 rolling manifest를 검증한다. |

## Required Evidence

- status bar desktop/narrow rendered state와 `Command-K` quick switcher interaction
- production build와 canonical/publication gate 판정
- source/tag/main SHA, terminal workflow conclusion과 fresh release artifact 판정

## Evidence

- production build에서 secondary repository button/class가 제거되고 현재 repository status,
  jj version/cache age와 updater action이 유지됐다.
- 합성 local/SSH repository를 사용하는 1440x900과 640x800 rendered smoke에서 status bar에
  임의 repository target이 나타나지 않았고 root overflow와 browser console error/warning이
  없었다.
- desktop rendered keyboard smoke에서 `Command-K`가 repository search/listbox와
  registered/discovered target을 가진 Quick Switcher를 열었다.
- `scripts/check.sh`에서 frontend test 186개, production build, Rust unit 80개와
  local/simulated SSH integration 7개, updater/Python/repository contract가 통과했다.
  machine-local SSH smoke 2개와 external packaged-updater test 1개는 fixture/artifact
  의존성에 따라 ignored다.
- release source `cd9fc9bbd18308275c888bb548639f7c1fa9afd0`는 `main@origin`과 일치하고
  main CI `31253789176`이 성공했다. 구현 change와 release-prep commit은 GitHub에서
  valid GPG signature로 확인됐다.
- GPG-signed `v0.9.17` tag는 release source와 같은 revision을 가리킨다. tag CI
  `31253948776`과 macOS Release `31253948787`이 같은 SHA에서 성공했다.
- draft가 아닌 prerelease에 6개 asset이 게시됐다. fresh download의 `SHA256SUMS`, Tauri
  Minisign, updater manifest, ZIP/tar/DMG 내부 app의 arm64/ad-hoc hardened-runtime signature,
  bundle identifier/version, DMG `/Applications` shortcut을 검증했다.
- rolling `updater-beta/latest-beta.json`은 versioned `v0.9.17` manifest와 byte-for-byte
  일치하고 두 macOS platform alias가 `0.9.17` updater archive를 가리킨다.

## Publication Impact

- public-ready source, test, release note와 durable 검증 판정만 tracked한다.
- screenshot, browser log, local path, machine inventory와 private key는 local-only다.
- 사용자의 배포 요청에 따라 `main` push, signed tag, prerelease와 rolling updater publish를
  수행한다.

## Out Of Scope

- 새로운 status bar repository chooser 또는 recent repository heuristic
- tab, repository rail과 quick switcher의 정보 구조 변경
- Developer ID signing, Apple notarization과 Intel/Windows/Linux package

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 rendered interaction, 전체 gate와 공개 release
artifact 검증을 통과한다.
