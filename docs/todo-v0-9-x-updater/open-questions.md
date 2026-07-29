# Open Questions: v0.9.x macOS In-App Updater

## Decisions

- The status-bar update action is app-global, trails repository/cache metadata,
  and identifies `jjcat` explicitly so it cannot be confused with `jj <version>`.
- No-update state is invisible. Available, downloading, ready-to-restart, and
  retry states occupy the same compact action slot.
- The app checks after startup without delaying registry load. The user starts
  downloads and restarts explicitly.
- The updater uses Tauri's signed app archive and embedded public key.
- Both `darwin-aarch64` and `darwin-aarch64-app` manifest keys point to the same
  signed Apple Silicon updater archive for current Tauri compatibility.
- Versioned releases own immutable updater archives and signatures. A separate
  rolling beta-channel asset owns only `latest-beta.json`.
- Release builds generate an untracked Tauri config overlay. The public key
  comes from repository variable `JJCAT_UPDATER_PUBLIC_KEY`; the private key and
  password come from `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Production activation requires a password-protected updater key. Missing
  public key, private key, or password fails before build and publication.
- `v0.9.0` cannot update itself. The first updater-enabled version is a manual
  bootstrap, and the following version proves the live in-app path.

## Production Activation Status

- [x] Generate a password-protected persistent updater key and retain its recovery
  copy in an owner-controlled location.
- [x] Add the public key to the repository variable and the private key/password to
  the GitHub Actions secret store.
- [ ] Create or authorize the rolling beta-channel release asset and publish the
  first updater-enabled bootstrap as `v0.9.1`.

The first two actions were explicitly authorized and completed without tracking
the private key, password, archive location, or raw command output. Rolling
channel and bootstrap publication remain separate external write boundaries.

## Non-blocking Follow-ups

- Developer ID signing/notarization remains an independent distribution
  decision.
- A stable channel can replace or coexist with the beta channel after jjcat
  publishes full GitHub releases.
