# Open Questions: v0.9.0 macOS Public Beta

## Decisions

- v0.9.0 is a macOS public beta and may be marked as a GitHub prerelease.
- Unsigned local builds are valid for packaging rehearsal only.
- The first beta uses a manual download and install path; an in-app updater is
  deferred.
- Release automation must stop before packaging when required Apple credentials
  are unavailable.

## Open

- Which authorized Apple Developer identity and notarization credential set
  will be provided to GitHub Actions?
- Should the first beta ship as a universal binary or use separate Apple
  Silicon and Intel artifacts after the initial signed package rehearsal?
- What minimum macOS version should be stated after clean-machine acceptance?

## Blocking Boundary

The source-preparation slice can complete without resolving the open questions.
The v0.9.0 tag and GitHub prerelease cannot be created until signing identity,
notarization credentials, artifact architecture, and clean-machine acceptance
are resolved with evidence.
