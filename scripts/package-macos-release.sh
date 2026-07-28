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
output_dir="release-dist"
output_app="$output_dir/jjcat_${version}_aarch64.app.zip"
output_dmg="$output_dir/jjcat_${version}_aarch64.dmg"

if [[ ! -d "$source_app" ]]; then
  printf 'Missing app bundle: %s\n' "$source_app" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$source_app"

mkdir -p "$output_dir"
rm -f "$output_app" "$output_dmg" "$output_dir/SHA256SUMS"

ditto -c -k --sequesterRsrc --keepParent "$source_app" "$output_app"

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
  shasum -a 256 "$(basename "$output_app")" "$(basename "$output_dmg")" > SHA256SUMS
)

printf 'Packaged jjcat %s for Apple Silicon in %s\n' "$version" "$output_dir"
