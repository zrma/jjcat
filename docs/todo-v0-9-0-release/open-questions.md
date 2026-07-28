# Open Questions: v0.9.0 macOS Public Beta

## Decisions

- v0.9.0 is a GitHub prerelease for Apple Silicon Macs running macOS 13 or
  newer.
- The artifacts are ad-hoc signed for bundle integrity, but are not Developer ID
  signed or notarized.
- The release contains a DMG, zipped app bundle, and `SHA256SUMS`.
- Supported first launch uses Finder `Open` or System Settings
  `Privacy & Security` > `Open Anyway`.
- The documentation does not advise disabling Gatekeeper or removing quarantine
  attributes.
- The first beta uses a manual download and install path; an in-app updater is
  deferred.

## Non-blocking Follow-ups

- Reconsider Developer ID signing/notarization only if distribution volume or
  support cost justifies an Apple Developer Program subscription.
- Decide whether demand warrants Intel or universal artifacts.
- Define updater behavior in a later 0.9.x milestone.

## Blocking Boundary

The `v0.9.0` tag and GitHub prerelease require verified app/DMG artifacts,
checksums, clean launch/restart, representative local and SSH smoke, repository
and public-boundary gates, and reviewed same-revision CI. Apple credentials are
not part of this release boundary.
