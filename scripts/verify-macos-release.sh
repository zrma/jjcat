#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(node -p "require('./package.json').version")"
output_dir="release-dist"
app_zip="$output_dir/jjcat_${version}_aarch64.app.zip"
dmg="$output_dir/jjcat_${version}_aarch64.dmg"
updater_archive="$output_dir/jjcat_${version}_aarch64.app.tar.gz"
updater_signature="$updater_archive.sig"
updater_manifest="$output_dir/latest-beta.json"
checksum_manifest="$output_dir/SHA256SUMS"
updater_archive_absolute="$repo_root/$updater_archive"
updater_signature_absolute="$repo_root/$updater_signature"

fail() {
  printf 'macOS release verification failed: %s\n' "$1" >&2
  exit 1
}

for artifact in \
  "$app_zip" \
  "$dmg" \
  "$updater_archive" \
  "$updater_signature" \
  "$updater_manifest" \
  "$checksum_manifest"; do
  [[ -f "$artifact" ]] || fail "missing expected artifact $(basename "$artifact")"
done
[[ -n "${JJCAT_UPDATER_PUBLIC_KEY:-}" ]] ||
  fail "JJCAT_UPDATER_PUBLIC_KEY is required for cryptographic verification"

expected_files="$(
  printf '%s\n' \
    "$checksum_manifest" \
    "$app_zip" \
    "$dmg" \
    "$updater_archive" \
    "$updater_signature" \
    "$updater_manifest" |
    LC_ALL=C sort
)"
actual_files="$(
  find "$output_dir" -mindepth 1 -maxdepth 1 -print |
    LC_ALL=C sort
)"
[[ "$actual_files" == "$expected_files" ]] ||
  fail "release-dist contains an unexpected artifact set"

(
  cd "$output_dir"
  shasum -a 256 -c SHA256SUMS
)

scripts/verify-updater-manifest.py \
  --manifest "$updater_manifest" \
  --version "$version" \
  --archive "$updater_archive" \
  --signature "$updater_signature"

JJCAT_UPDATER_ARCHIVE="$updater_archive_absolute" \
  JJCAT_UPDATER_SIGNATURE="$updater_signature_absolute" \
  cargo test \
    --quiet \
    --manifest-path src-tauri/Cargo.toml \
    --test updater_artifact \
    verifies_external_updater_artifact \
    -- \
    --ignored \
    --exact

verify_app() {
  local app_bundle="$1"
  local plist="$app_bundle/Contents/Info.plist"
  local executable="$app_bundle/Contents/MacOS/jjcat"
  local identifier
  local bundle_version
  local minimum_system_version
  local architectures
  local signing_details

  [[ -d "$app_bundle" ]] || fail "packaged app bundle is missing"
  [[ -f "$plist" ]] || fail "packaged app Info.plist is missing"
  [[ -x "$executable" ]] || fail "packaged app executable is missing"

  codesign --verify --deep --strict "$app_bundle"

  identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
  bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
  minimum_system_version="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")"
  architectures="$(lipo -archs "$executable")"
  signing_details="$(codesign -dv --verbose=4 "$app_bundle" 2>&1)"

  [[ "$identifier" == "com.1day1coding.jjcat" ]] ||
    fail "packaged app identifier is not com.1day1coding.jjcat"
  [[ "$bundle_version" == "$version" ]] ||
    fail "packaged app version does not match $version"
  [[ "$minimum_system_version" == "13.0" ]] ||
    fail "packaged app minimum system version is not 13.0"
  [[ "$architectures" == "arm64" ]] ||
    fail "packaged app architecture is not arm64"
  grep -q '^Signature=adhoc$' <<<"$signing_details" ||
    fail "packaged app is not ad-hoc signed"
  grep -q '^CodeDirectory .*flags=.*runtime' <<<"$signing_details" ||
    fail "packaged app does not enable the hardened runtime"
  grep -q '^TeamIdentifier=not set$' <<<"$signing_details" ||
    fail "packaged app unexpectedly contains a Developer ID team"
  grep -q '^Sealed Resources version=2' <<<"$signing_details" ||
    fail "packaged app resources are not sealed"
}

zip_extract="$(mktemp -d "${TMPDIR:-/tmp}/jjcat-verify-zip.XXXXXX")"
dmg_mount="$(mktemp -d "${TMPDIR:-/tmp}/jjcat-verify-dmg.XXXXXX")"
updater_extract="$(mktemp -d "${TMPDIR:-/tmp}/jjcat-verify-updater.XXXXXX")"
dmg_attached=false

cleanup_directory() {
  local directory="$1"
  case "$(basename "$directory")" in
    jjcat-verify-zip.* | jjcat-verify-dmg.* | jjcat-verify-updater.*)
      rm -rf -- "$directory"
      ;;
  esac
}

cleanup() {
  if [[ "$dmg_attached" == true ]]; then
    hdiutil detach "$dmg_mount" >/dev/null 2>&1 || true
  fi
  cleanup_directory "$zip_extract"
  cleanup_directory "$dmg_mount"
  cleanup_directory "$updater_extract"
}
trap cleanup EXIT

ditto -x -k "$app_zip" "$zip_extract"
verify_app "$zip_extract/jjcat.app"

tar -xzf "$updater_archive" -C "$updater_extract"
verify_app "$updater_extract/jjcat.app"

hdiutil attach -readonly -nobrowse -mountpoint "$dmg_mount" "$dmg" >/dev/null
dmg_attached=true
verify_app "$dmg_mount/jjcat.app"
[[ -L "$dmg_mount/Applications" ]] ||
  fail "DMG does not contain the Applications shortcut"
[[ "$(readlink "$dmg_mount/Applications")" == "/Applications" ]] ||
  fail "DMG Applications shortcut has an unexpected target"
hdiutil detach "$dmg_mount" >/dev/null
dmg_attached=false

printf 'macOS release artifacts are valid: %s arm64 ad-hoc beta\n' "$version"
