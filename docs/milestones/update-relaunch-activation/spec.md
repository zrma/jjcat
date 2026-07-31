# Spec: Update Relaunch Activation

Status: completed

## Goal

- 사용자가 **Restart to update**를 선택한 뒤 새 jjcat 프로세스가 기존 main window와
  동일하게 macOS 전면 앱으로 복귀한다.

## Context

- 이전 updater는 설치 뒤 `relaunch()`만 호출했다. 새 프로세스는 window size, position과
  maximized state를 복원하지만 이전 프로세스의 macOS application activation은 승계하지
  않아 Dock icon을 다시 눌러야 창이 전면에 나타날 수 있었다.

## Scope

- updater restart 직전에 짧은 수명의 one-shot foreground intent를 app-owned storage에
  기록한다.
- 새 main window가 준비되면 intent를 한 번만 소비하고 window를 show/focus한다.
- 일반 launch와 별도 diff window는 foreground intent를 소비하거나 focus를 빼앗지 않는다.
- `v0.9.9` Apple Silicon macOS beta와 rolling updater manifest를 게시한다.

## Constraints

- window size, position, maximized state와 diff/layout preference 복원을 유지한다.
- update download 또는 restart는 계속 사용자 명시 동작이어야 한다.
- 영구적인 focus-stealing preference나 Apple Developer ID/notarization 범위는 추가하지 않는다.
- tracked evidence에는 local path, machine inventory나 raw diagnostic output을 남기지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| R1 | done | focused unit test | foreground intent는 유효 시간 안에 한 번만 소비되고 stale/invalid intent는 제거된다. |
| R2 | done | focused unit test + production build | 유효한 updater relaunch에서 main window를 show한 뒤 focus하고, 일반 launch에서는 실행하지 않는다. |
| R3 | done | repository contract + review | restart 실패 시 intent를 지우고 Quick Look이나 일반 launch에 focus를 강제하지 않는다. |
| R4 | done | `scripts/check.sh` | canonical frontend, Rust와 repository gate가 통과한다. |
| R5 | done | tag/release verification | signed change/tag, same-SHA CI, macOS asset와 rolling manifest가 `v0.9.9`를 가리킨다. |

## Required Evidence

- foreground intent lifecycle과 ordered show/focus unit test
- production frontend build와 canonical `scripts/check.sh`
- publication boundary 및 machine-local private-inventory gate
- remote main/tag SHA, terminal CI/release workflow와 fresh public artifact verification

## Publication Impact

- source, tests, repository contract, durable status와 `v0.9.9` release note가 공개된다.
- updater signing credential, private inventory와 machine-specific smoke detail은 local-only다.
- 사용자 요청에 따라 main push, signed tag와 GitHub prerelease/rolling manifest publish가 포함된다.

## Out Of Scope

- 일반 launch에서 항상 app focus를 강제하는 동작
- 자동 download, 자동 restart 또는 background launch policy 변경
- Developer ID signing/notarization

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과하며, `v0.9.9` remote main,
tag, prerelease asset, rolling manifest와 terminal workflow가 같은 release revision으로
검증된다.
