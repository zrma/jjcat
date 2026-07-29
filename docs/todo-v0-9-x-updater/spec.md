# Spec: v0.9.x macOS In-App Updater

Status: active

v0.9.1 bootstrap: published and installed; v0.9.2 live update pending

## Goal

Add a signed, user-controlled in-app update path for the Apple Silicon macOS
beta. When a newer jjcat beta is available, the status bar exposes a compact
download action, reports progress, and offers an explicit restart after the
update is installed.

## Context

`v0.9.0` established a repeatable app/DMG prerelease but intentionally deferred
the updater contract. The current status bar already separates repository state
from app-wide information, making its trailing edge the least disruptive place
for an update action.

The installed `v0.9.0` binary has no updater code or embedded updater public key.
The first updater-enabled build is therefore a manually installed bootstrap;
only later versions can prove the in-app path.

## Scope

- Add the Tauri updater and process plugins for desktop builds.
- Check the beta update channel after startup without blocking repository load.
- Render nothing when no update is available.
- Render an explicit `jjcat <version>` download action at the trailing edge of
  the status bar when an update is available.
- Report download progress, install the signature-verified update, and require
  an explicit `Restart to update` action.
- Keep a manual `Check for Updates` retry path in the status-bar action.
- Generate a signed macOS updater archive, signature, and `latest-beta.json`
  alongside the existing app archive, DMG, and checksum manifest.
- Publish versioned updater artifacts before moving the rolling beta manifest.
- Verify the updater state machine, manifest, artifact signature, packaged app,
  and a two-version local update path with an ephemeral test key.

## Constraints

- Update installation must use Tauri's mandatory updater signature verification;
  a checksum from the same release is not an authorization boundary.
- The updater public key is public build configuration injected into a
  release-only overlay. The private key, password, raw key-generation output,
  and recovery copy remain local-only or in an authorized secret store.
- Production signing-key creation and GitHub secret changes are external
  decision/write boundaries and were explicitly completed. Channel publication,
  tag creation, and release publication remain separate boundaries.
- The beta channel remains separate from GitHub's full-release `latest` pointer.
- Downloads may proceed while the app is in use, but jjcat never forces a
  restart or interrupts an active repository operation.
- The existing ad-hoc Apple code signature and non-notarized Gatekeeper boundary
  remain explicit. Tauri updater signing does not claim Developer ID identity.
- Update checks are bounded and failures do not replace repository readiness or
  cached repository state.
- Existing `v0.9.0` users must manually install the updater bootstrap version.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| U1 | done | focused TypeScript tests | Update states cover checking, available, downloading, ready, retry, and no-update behavior. |
| U2 | done | rendered desktop and narrow smoke | The trailing status-bar action appears only for available/in-progress/ready/error states and remains distinguishable from the `jj` CLI version. |
| U3 | done | Rust/TypeScript integration checks | Production desktop startup performs a non-blocking bounded check; browser/demo runtime performs no network update request. |
| U4 | done | updater artifact verifier | The macOS archive and `.sig` match the embedded public key, and `latest-beta.json` contains valid `darwin-aarch64` and `darwin-aarch64-app` entries. |
| U5 | done | release workflow contract | Versioned updater artifacts are verified and uploaded before the rolling beta manifest is replaced. Missing signing credentials fail before publication with a bounded message. |
| U6 | done | isolated two-version smoke | An older updater-enabled app discovers a newer fixture release, downloads and verifies it, installs it, and reaches the explicit restart boundary. |
| U7 | done | `scripts/check.sh` | Canonical repository, frontend, Rust, and publication self-test gates pass. |
| U8 | done | cold diff review | No private key, machine inventory, production insecure endpoint, forced restart, or unrelated behavior is included. |
| U9 | done | redacted persistent-key verification | The password-protected recovery copy, GitHub Actions credentials, and a locally signed release artifact use the same production public key without tracking secret material. |
| U10 | pending | public two-version verification | The installed `v0.9.1` bootstrap discovers, downloads, verifies, installs, and explicitly restarts into published `v0.9.2`. |

## Required Evidence

- Focused state-machine and manifest/verifier test verdicts.
- Desktop and narrow rendered captures for available, downloading, ready, and
  retry states using synthetic update metadata.
- An isolated, ephemeral-key updater smoke that starts from an older
  updater-enabled build and verifies a newer signed bundle.
- App/DMG/updater artifact names and redacted verification verdicts.
- Redacted persistent-key archive, GitHub credential-presence, public-key match,
  and signed release-artifact verification verdicts.
- Canonical `scripts/check.sh` result and final `jj status`/diff review.
- Remote revisions, terminal CI, versioned release assets, rolling beta
  manifest contents, clean install, and live in-app update evidence.

## Local Verification

- Frontend state-machine tests cover invisible automatic checks, manual checking,
  available/download/progress/ready states, restart blocking, and bounded retry
  labels. Desktop and minimum-width rendered smokes cover available,
  downloading, ready, and error actions.
- Updater helper tests reject non-loopback insecure endpoints and verify the
  versioned manifest URL plus both macOS platform aliases. Rust tests accept a
  known Tauri signer fixture and reject a tampered payload.
- An ephemeral release key produced an ad-hoc-signed app archive, `.sig`,
  application archive, DMG, `latest-beta.json`, and checksum manifest. The
  release verifier accepted the code seal, app identity/version/architecture,
  checksums, manifest contract, and archive signature.
- The password-protected persistent key is retained in an owner-controlled
  recovery archive with restrictive permissions. The repository public
  variable matched the archived public key, both signing secrets were present,
  and the `v0.9.1` release signed from the recovery copy passed the
  app, DMG, updater archive, manifest, checksum, and signature verifiers. Its
  Gatekeeper rejection also matched the documented ad-hoc-signed/not-notarized
  boundary. No key value, password, or archive inventory is tracked.
- The signed `v0.9.1` tag, same-SHA CI and Release workflow completed
  successfully. A fresh download of all versioned assets passed the release
  verifier, the rolling manifest matched the versioned manifest, and the public
  DMG replaced an existing `v0.9.0` install with a running `v0.9.1` app while
  retaining the registry.
- A persistent-key `v0.9.2` release candidate passed the same local app, DMG,
  updater archive, manifest, checksum, signature, and Gatekeeper-boundary
  verification before publication.
- An isolated updater-enabled `0.9.0` fixture discovered a signed `0.9.1`
  fixture over a loopback-only channel, downloaded and installed it, exposed
  `Restart to update`, relaunched as `0.9.1`, and then hid the action because no
  newer version remained. This does not retrofit updater support into the
  published `v0.9.0`.
- `scripts/check.sh` and the release workflow static check pass. Generated
  artifacts, temporary applications, and ephemeral key material were removed
  after verification.

## Publication Impact

This work changes public runtime code, updater public-key injection, release
automation, documented distribution behavior, and future executable artifacts.
The owner authorized persistent key creation, GitHub Actions credential
configuration, main pushes, signed tags, rolling-channel mutation, and the
two-version beta releases. No private key or password is tracked.

## Out Of Scope

- Automatic background download or forced restart.
- Developer ID signing, notarization, Intel/universal macOS, Linux, or Windows.
- Downgrades, staged rollout percentages, multiple mirrors, or a dynamic update
  service.
- Updating the independently installed `jj` CLI.
- Retrofitting updater behavior into the already published `v0.9.0` binary.

## Completion Rule

All local acceptance items are backed by focused and canonical evidence.
Persistent key recovery and GitHub Actions credential configuration are
complete. The `v0.9.1` bootstrap release and clean replacement install are
verified. A following live update to published `v0.9.2` must still be verified
before this todo is archived.
