# Spec: update-check-cadence

Status: completed

## Goal

- 실행 중인 jjcat으로 돌아왔을 때 새 beta update를 자연스럽게 발견하되, 잦은 창 전환이
  불필요한 network polling을 만들지 않게 한다.

## Context

- `v0.9.5`까지 updater는 앱 시작 약 1초 뒤 한 번 자동 확인하고, 이후에는 app menu의
  **Check for Updates…**만 제공했다.
- 장시간 실행 중인 앱은 이후 게시된 update를 앱 재시작이나 수동 확인 전까지 발견하지
  못했다.

## Scope

- 기존 startup automatic check를 유지한다.
- main window가 focus를 얻은 상태로 3초간 유지되면 background update check를 예약한다.
- focus를 3초 안에 잃으면 예약된 check를 취소한다.
- 실제 check 시도 시각을 startup, focus-triggered와 manual 경로가 공유하고,
  focus-triggered automatic check에는 1시간 cooldown을 적용한다.
- manual check는 cooldown을 우회해 즉시 실행한다.

## Constraints

- automatic no-update와 failure는 기존처럼 status bar에 표시하지 않는다.
- update를 발견한 뒤의 available/download/ready lifecycle과 in-flight check는 중복 실행하지
  않는다.
- update를 자동 다운로드하거나 강제로 restart하지 않는다.
- fixed interval polling 또는 background-only wakeup을 추가하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| U1 | done | scheduler unit test | 최초 시도, cooldown 직전과 정확한 만료 경계를 검증한다. |
| U2 | done | production frontend build | Tauri main-window focus listener가 3초 dwell과 focus-loss cancel을 적용한다. |
| U3 | done | updater state tests | automatic 상태는 invisible이고 pending update lifecycle은 exclusive다. |
| U4 | done | `scripts/check.sh` | frontend, Rust와 public-ready repository gate가 통과한다. |

## Required Evidence

- automatic check cooldown focused unit test
- production TypeScript/Vite build
- canonical repository 및 publication boundary gates
- signed release tag, same-SHA terminal CI/Release workflows와 fresh artifact verification

## Publication Impact

- public-ready frontend, test, version metadata와 product/release documentation을 변경한다.
- `v0.9.6` Apple Silicon macOS beta로 tag-triggered prerelease와 rolling beta manifest를
  게시한다.
- updater private key와 password는 기존 GitHub Actions secret 경계에만 남긴다.

## Out Of Scope

- update 자동 다운로드 또는 강제 restart
- fixed interval polling, OS background task 또는 별도 telemetry
- Developer ID signing/notarization, Intel, Linux와 Windows distribution

## Completion Rule

focused test, production build, canonical/publication gates, signed tag와 same-SHA terminal
CI/Release artifact 검증이 모두 통과한다.
