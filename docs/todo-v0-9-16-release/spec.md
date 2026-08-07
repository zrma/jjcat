# Spec: v0-9-16-release

Status: active

## Goal

- Graph revision tag 표시를 `v0.9.16` Apple Silicon macOS beta와 signed updater로
  public channel에 배포하고 end-to-end 출고 증거를 닫는다.

## Context

- local `main`의 `feat: show tags in revision graph` change는 focused/browser/canonical
  gate를 통과했지만 `main@origin`과 공개 updater에는 아직 포함되지 않았다.
- 기존 `v0.9.15` distribution contract는 Apple Silicon arm64, ad-hoc hardened-runtime
  app, Tauri Minisign updater signature와 not-notarized prerelease다.

## Scope

- source version, release note, README/status/handoff를 `0.9.16`으로 정렬한다.
- canonical gate와 repository/machine-local public boundary gate를 통과한다.
- local `main`, `main@origin`과 release target을 같은 source revision으로 맞춘다.
- GPG-signed `v0.9.16` tag를 게시해 tag CI와 Release workflow를 실행한다.
- 공개 asset 6개를 fresh download해 checksum, updater signature, ZIP/tar/DMG 내부 app의
  arm64/ad-hoc/hardened-runtime contract와 rolling manifest를 검증한다.
- release evidence를 milestone/status/handoff에 반영하고 closeout change를 push한다.

## Constraints

- 기존 사용자 변경과 repository contract를 보존한다.
- Developer ID signing/notarization을 새 요구사항으로 만들지 않는다.
- tag/release 전에 source revision, version, note와 attribution을 일치시킨다.
- rolling updater manifest는 immutable versioned asset 검증이 끝난 뒤에만 교체한다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | `scripts/check.sh` | `0.9.16` source/version/release note와 canonical gate가 일치한다. |
| C2 | done | publication boundary `--mode all` | public tracked/history/release surface가 private inventory를 노출하지 않는다. |
| C3 | todo | remote SHA + terminal CI | release source revision이 `main@origin`에 있고 same-SHA main CI가 성공한다. |
| C4 | todo | signed tag + terminal workflows | `v0.9.16` tag, tag CI와 Release가 같은 revision에서 성공한다. |
| C5 | todo | fresh public artifact verification | 6개 asset, checksum, updater signature, ZIP/tar/DMG app과 rolling manifest를 검증한다. |
| C6 | todo | closeout remote SHA + terminal CI | release evidence 문서를 push하고 clean state와 terminal closeout CI를 확인한다. |

## Required Evidence

- source/tag/main SHA와 terminal workflow conclusion
- fresh public asset count/digest, signature/bundle/DMG/rolling manifest 판정
- canonical and public-boundary gate 판정

## Evidence

- `scripts/check.sh`에서 186개 frontend test, production build, Rust unit 80개와 local/simulated
  SSH integration 7개, updater/Python/repository contract가 통과했다. machine-local SSH
  smoke 2개와 external packaged-updater test 1개는 fixture/artifact 의존성에 따라 ignored다.
- repository publication gate와 권한 있는 machine-local `--mode all` 검사가 live public
  visibility에서 통과했다.

## Publication Impact

- public-ready version metadata, release note와 durable release evidence만 tracked한다.
- private key, machine inventory, local path와 raw build/browser output은 tracked하지 않는다.
- 사용자의 배포 요청에 따라 `main` push, signed tag, GitHub prerelease와 rolling updater
  manifest publish를 수행한다.

## Out Of Scope

- Developer ID signing, Apple notarization과 Intel/Windows/Linux package
- tag 생성/삭제 UI와 annotated tag message viewer
- updater 자동 다운로드 또는 강제 restart

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 전체 gate가 통과한다.
