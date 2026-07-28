# v0.9.0 macOS Public Beta

Status: active

## Goal

Prepare and publish `jjcat` v0.9.0 as a macOS public beta only after the app
bundle and DMG are signed, notarized, installable, and proven against local and
SSH-backed Jujutsu repositories.

## Context

P3 established the daily-driver graph, diff, workspace, mutation, undo/redo,
repository discovery, and SSH workflows. The next useful boundary is a
repeatable macOS release rather than another feature milestone.

The source tree can prepare version metadata, packaging, documentation, and a
tag-triggered release workflow without holding Apple credentials. Publishing
the release remains blocked until authorized signing and notarization evidence
is available.

## Scope

- Synchronize the frontend, Rust package, and Tauri application versions at
  `0.9.0`.
- Build `.app` and `.dmg` artifacts for macOS.
- Add a tag-triggered GitHub prerelease workflow with an explicit Apple
  credential preflight.
- Define checksum, clean-install, launch, restart, local-repository, and
  SSH-repository acceptance evidence.
- Keep tracked release documentation public-ready and free of private
  inventory.

## Constraints

- Apple credentials and certificates must remain outside the repository.
- A locally built unsigned artifact is preparation evidence only and must not
  be published as the v0.9.0 release.
- v0.9.0 targets macOS. Linux, Windows, an in-app updater, and a built-in
  conflict editor are not release requirements.
- No tag or GitHub Release may be created before the signed and notarized
  artifact gates pass.

## Acceptance Checklist

- [x] `package.json`, `src-tauri/Cargo.toml`, and
  `src-tauri/tauri.conf.json` all declare version `0.9.0`.
- [x] Tauri produces both an app bundle and a DMG.
- [x] The release workflow rejects missing Apple credentials before packaging.
- [ ] The signed application passes `codesign` verification and Gatekeeper
  assessment.
- [ ] The notarized DMG passes stapling validation and checksum verification.
- [ ] A clean install launches, quits, relaunches, and preserves safe user
  preferences.
- [ ] Local and SSH repository discovery, graph, diff, fetch, and one
  preview-first mutation smoke pass.
- [ ] Repository gates and both public publication-boundary gates pass.
- [ ] The GitHub prerelease points at the reviewed tag and contains only the
  expected public artifacts.

## Required Evidence

- Terminal output summaries for the canonical repository gate and public
  publication-boundary gates.
- Artifact paths, sizes, and SHA-256 checksums without machine-local path
  disclosure in tracked files.
- `codesign`, Gatekeeper, notarization, and stapling verification verdicts.
- Clean-install and representative local/SSH smoke verdicts.
- The final tag, commit SHA, GitHub Release URL, and terminal CI conclusion.

## Preparation Evidence

- The canonical repository gate passed after the version and workflow changes.
- A local unsigned arm64 build produced `jjcat.app` and
  `jjcat_0.9.0_aarch64.dmg`; both bundle versions report `0.9.0`.
- The release contract checker verified that the tag workflow performs its
  Apple credential preflight before packaging.
- These unsigned artifacts are preparation evidence only. They are not release
  candidates and do not satisfy signing, notarization, clean-install, or
  local/SSH acceptance.

## Publication Impact

This milestone changes public version metadata, release automation, user-facing
release status, and eventually publishes executable artifacts. Source changes
may be pushed while the milestone remains active. Tagging and artifact
publication require the stricter release boundary in this specification.

## Out Of Scope

- Linux and Windows acceptance.
- Automatic updates inside the application.
- A bundled remote helper or agent.
- New history-shaping features unrelated to release readiness.

## Completion Rule

Close this milestone only after the signed and notarized macOS prerelease is
published from the reviewed v0.9.0 tag, clean-install and local/SSH smoke
evidence pass, public boundary checks pass, and the release CI is terminal and
successful.
