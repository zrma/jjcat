# v0.9.0 macOS Public Beta

Status: completed

## Goal

Prepare and publish `jjcat` v0.9.0 as an Apple Silicon macOS public beta with
reproducible app and DMG artifacts, SHA-256 checksums, explicit
non-Developer-ID first-launch guidance, and proven local/SSH repository
behavior.

## Context

P3 established the daily-driver graph, diff, workspace, mutation, undo/redo,
repository discovery, and SSH workflows. The next useful boundary is a
repeatable public beta rather than another feature milestone.

This personal open-source release does not justify an Apple Developer Program
subscription. The first beta therefore ships without Developer ID signing or
notarization and states that boundary plainly instead of weakening macOS
security controls.

## Scope

- Keep the frontend, Rust package, and Tauri application versions at `0.9.0`.
- Build Apple Silicon `.app` and `.dmg` artifacts for macOS 13 or newer.
- Publish a tag-triggered GitHub prerelease with normalized public filenames.
- Generate and verify `SHA256SUMS` for every uploaded binary artifact.
- Document Finder `Open` and System Settings `Open Anyway` as the supported
  Gatekeeper first-launch paths.
- Verify clean install, launch, restart, local repository, and SSH repository
  behavior before publication.
- Keep tracked release material public-ready and free of private inventory.

## Constraints

- v0.9.0 artifacts are ad-hoc signed for bundle integrity, but are not Developer
  ID signed or notarized.
- The release must not instruct users to disable Gatekeeper or remove quarantine
  attributes.
- v0.9.0 targets Apple Silicon only. Intel/universal binaries, Linux, Windows,
  an in-app updater, and a built-in conflict editor are not release requirements.
- A local build is evidence, not permission to publish. Tagging still requires
  repository gates, public-boundary gates, representative smoke, and a reviewed
  release payload.

## Acceptance Checklist

- [x] `package.json`, `src-tauri/Cargo.toml`, and
  `src-tauri/tauri.conf.json` all declare version `0.9.0`.
- [x] Tauri produces both an app bundle and a DMG.
- [x] The release workflow targets a public Apple Silicon runner and publishes
  a GitHub prerelease without private signing credentials.
- [x] Release notes disclose the ad-hoc-signed/not-notarized boundary and
  supported Gatekeeper first-launch paths.
- [x] The app and DMG build locally and their public archive names and SHA-256
  checksums verify.
- [x] A clean install launches, quits, relaunches, and preserves safe user
  preferences.
- [x] Local and SSH repository discovery, graph, diff, fetch, and one
  preview-first mutation smoke pass.
- [x] Repository gates and both public publication-boundary gates pass.
- [x] The reviewed `v0.9.0` tag, release commit, workflow run, and prerelease
  resolve to the same source revision.
- [x] The prerelease contains only the expected app archive, DMG, and checksum
  manifest.

## Required Evidence

- Terminal verdicts for the canonical repository gate and both public
  publication-boundary gates.
- Artifact names, sizes, and verified SHA-256 checksums without machine-local
  path disclosure in tracked files.
- Bundle version, architecture, ad-hoc code-signing state, and expected
  Gatekeeper assessment verdicts.
- Clean-install and representative local/SSH smoke verdicts.
- Final tag, commit SHA, GitHub prerelease URL, and terminal CI conclusion.

## Local Release Candidate Evidence

- The release verifier accepts only the expected app archive, DMG, and checksum
  manifest, then verifies SHA-256, bundle identifier, version, macOS 13 minimum,
  arm64 architecture, and sealed ad-hoc signatures inside both artifacts.
- An isolated clean app launch, quit, and relaunch preserved the repository
  registry. The packaged UI loaded local and synthetic OpenSSH repositories,
  graph and bounded diff views, and previewed fetch and mutation actions without
  executing them against the working repository.
- Fixture-backed local/simulated-SSH integration executed fetch and core
  mutations, while a machine-local representative SSH repository passed
  read-only projection, operation-log, and bounded-diff smoke.
- The canonical repository gate, repository publication check, and authorized
  machine-local publication guard passed for the release-candidate diff.

## Published Release Evidence

- The GPG-signed `v0.9.0` tag, remote `main`, tag CI, and release workflow
  resolve to commit `41bfbc00e09d4872a249c62eb244d14181c79d6e`.
- [Tag CI run 30456226401](https://github.com/zrma/jjcat/actions/runs/30456226401)
  and [release run 30456225727](https://github.com/zrma/jjcat/actions/runs/30456225727)
  completed successfully.
- The [v0.9.0 GitHub prerelease](https://github.com/zrma/jjcat/releases/tag/v0.9.0)
  contains only `jjcat_0.9.0_aarch64.app.zip`,
  `jjcat_0.9.0_aarch64.dmg`, and `SHA256SUMS`; a fresh download passed the
  published checksum manifest.

## Publication Impact

This milestone changes public version metadata, release automation,
user-facing release status, and publishes executable artifacts. The artifact
limitations are part of the release contract, not a hidden exception.

## Out Of Scope

- Developer ID signing and notarization.
- Intel or universal macOS artifacts.
- Linux and Windows acceptance.
- Automatic updates inside the application.
- A bundled remote helper or agent.
- New history-shaping features unrelated to release readiness.

## Completion Rule

Close this milestone only after the Apple Silicon macOS prerelease is published
from the reviewed v0.9.0 tag, checksums and local/SSH smoke pass, public boundary
checks pass, the release CI is terminal and successful, and the uploaded assets
match the documented non-Developer-ID release contract.
