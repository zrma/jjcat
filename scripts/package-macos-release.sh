#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(node -p "require('./package.json').version")"
arch="$(uname -m)"
if [[ "$arch" != "arm64" && "$arch" != "aarch64" ]]; then
  printf 'Apple Silicon release packaging requires arm64, got %s\n' "$arch" >&2
  exit 1
fi

bundle_root="src-tauri/target/release/bundle"
source_app="$bundle_root/macos/jjcat.app"
source_updater_archive="$bundle_root/macos/jjcat.app.tar.gz"
source_updater_signature="$source_updater_archive.sig"
output_dir="release-dist"
output_app="$output_dir/jjcat_${version}_aarch64.app.zip"
output_dmg="$output_dir/jjcat_${version}_aarch64.dmg"
output_updater_archive="$output_dir/jjcat_${version}_aarch64.app.tar.gz"
output_updater_signature="$output_updater_archive.sig"
output_updater_manifest="$output_dir/latest-beta.json"

if [[ ! -d "$source_app" ]]; then
  printf 'Missing app bundle: %s\n' "$source_app" >&2
  exit 1
fi
if [[ ! -f "$source_updater_archive" || ! -f "$source_updater_signature" ]]; then
  printf 'Missing signed updater artifacts under %s\n' "$bundle_root/macos" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$source_app"

mkdir -p "$output_dir"
rm -f \
  "$output_app" \
  "$output_dmg" \
  "$output_updater_archive" \
  "$output_updater_signature" \
  "$output_updater_manifest" \
  "$output_dir/SHA256SUMS"

ditto -c -k --sequesterRsrc --keepParent "$source_app" "$output_app"
cp "$source_updater_archive" "$output_updater_archive"
cp "$source_updater_signature" "$output_updater_signature"

scripts/create-updater-manifest.py \
  --version "$version" \
  --archive-name "$(basename "$output_updater_archive")" \
  --signature-file "$output_updater_signature" \
  --output "$output_updater_manifest"

staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/jjcat-release.XXXXXX")"
cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT

ditto "$source_app" "$staging_dir/jjcat.app"
ln -s /Applications "$staging_dir/Applications"
hdiutil create \
  -volname "jjcat" \
  -srcfolder "$staging_dir" \
  -ov \
  -format UDZO \
  "$output_dmg"

(
  cd "$output_dir"
  shasum -a 256 \
    "$(basename "$output_app")" \
    "$(basename "$output_dmg")" \
    "$(basename "$output_updater_archive")" \
    "$(basename "$output_updater_signature")" \
    "$(basename "$output_updater_manifest")" \
    > SHA256SUMS
)

printf 'Packaged jjcat %s for Apple Silicon in %s\n' "$version" "$output_dir"
