#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parent.parent

REQUIRED_PATHS = (
    "AGENTS.md",
    "CONTRIBUTING.md",
    "README.md",
    "SECURITY.md",
    "docs/ARCHITECTURE.md",
    "docs/ESCALATION_POLICY.md",
    "docs/HANDOFF.md",
    "docs/PRODUCT.md",
    "docs/PUBLICATION.md",
    "docs/REPO_MANIFEST.yaml",
    "docs/agent-harness.md",
    "docs/completed-milestones.md",
    "docs/roadmap.md",
    "docs/status.md",
    "scripts/check-agent-harness-interface.sh",
    "scripts/check-publication-boundary.py",
    "scripts/check-release-version.py",
    "scripts/check.sh",
    "scripts/create-updater-config.py",
    "scripts/create-updater-manifest.py",
    "scripts/finalize-change.sh",
    "scripts/package-macos-release.sh",
    "scripts/start-work.sh",
    "scripts/tests/test_updater_tools.py",
    "scripts/verify-macos-release.sh",
    "scripts/verify-updater-manifest.py",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "package.json",
    "pnpm-lock.yaml",
    "src/App.tsx",
    "src/appUpdater.ts",
    "src/main.tsx",
    "src/lib/appUpdate.ts",
    "src/lib/appUpdateLegacy.ts",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/capabilities/default.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/tests/fixtures/updater-signature-payload.txt",
    "src-tauri/tests/updater_artifact.rs",
)


def fail(message: str) -> None:
    print(f"repository contract check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


for relative in REQUIRED_PATHS:
    path = ROOT / relative
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"missing or empty {relative}")

manifest = read("docs/REPO_MANIFEST.yaml")
harness = read("docs/agent-harness.md")
status = read("docs/status.md")
readme = read("README.md")
handoff = read("docs/HANDOFF.md")
publication = read("docs/PUBLICATION.md")
security = read("SECURITY.md")
roadmap = read("docs/roadmap.md")
start_work = read("scripts/start-work.sh")
cargo_manifest = read("src-tauri/Cargo.toml")
package_manifest = read("package.json")
ci_workflow = read(".github/workflows/ci.yml")
release_workflow = read(".github/workflows/release.yml")
tauri_config = json.loads(read("src-tauri/tauri.conf.json"))
tauri_capabilities = json.loads(read("src-tauri/capabilities/default.json"))
app_source = read("src/App.tsx")
app_updater_source = read("src/appUpdater.ts")
main_source = read("src/main.tsx")
app_update_state = read("src/lib/appUpdate.ts")
tauri_source = read("src-tauri/src/lib.rs")

for fragment in (
    "name: jjcat",
    "publication_class: public",
    "content_standard: public-ready",
    "remote_visibility_policy: private-or-public",
    "remote_status: configured-public",
    "remote: https://github.com/zrma/jjcat",
    "license_status: Apache-2.0",
    "id: RUSTSEC-2024-0429",
    "scope: upstream-linux-transitive",
    "review: dependency-refresh-or-linux-distribution",
    "application_identifier: com.1day1coding.jjcat",
    "status: selected",
    "desktop: Tauri 2",
    "frontend: React with TypeScript and Vite",
    "full: scripts/check.sh",
    "start_work: scripts/start-work.sh --work-id <work-id>",
    "local: jj",
    "push_requires_explicit_permission: true",
):
    if fragment not in manifest:
        fail(f"manifest is missing {fragment!r}")

manifest_class = re.search(r"^publication_class: (public|internal)$", manifest, re.MULTILINE)
harness_class = re.search(r"^- Publication class: `(public|internal)`\.$", harness, re.MULTILINE)
if not manifest_class or not harness_class or manifest_class.group(1) != harness_class.group(1):
    fail("manifest and agent harness publication classes differ")

package_version = json.loads(package_manifest).get("version")

if "All your jj repos, one window." not in readme:
    fail("README product identity is missing")
if "`P3: Safe Shaping`" not in status or "`P4: Distribution`까지 완료됐다" not in status:
    fail("status does not record P3 and P4 completion")
if "`v0.9.0` public beta" not in status:
    fail("status does not identify the original published v0.9.0 beta")
if "`v0.9.1` bootstrap" not in status:
    fail("status does not identify the published v0.9.1 updater bootstrap")
if f"`v{package_version}` Apple Silicon macOS beta" not in status:
    fail(f"status does not identify the v{package_version} release target")
if "현재 content class는 `public`" not in status:
    fail("status does not declare the public tracked surface")
if "publication class는 public" not in handoff:
    fail("handoff does not declare the public tracked surface")
if "`jjcat`의 tracked repository surface는 `public`" not in publication:
    fail("publication policy does not declare the public tracked surface")
if "Decision status: deferred, not planned work." not in publication:
    fail("publication policy does not preserve the deferred Developer ID decision")
if not re.search(r"유료 Apple\s+Developer Program", roadmap) or "Deferred, not planned:" not in roadmap:
    fail("roadmap presents Developer ID signing/notarization as pending work")
for source_name, source in (
    ("README", readme),
    ("status", status),
    ("handoff", handoff),
):
    if not re.search(r"유료 Apple\s+Developer Program", source) or not re.search(
        r"현재\s+계획된 작업이\s+아니", source
    ):
        fail(f"{source_name} does not preserve the non-planned Developer ID decision")
license_path = ROOT / "LICENSE"
if not license_path.is_file():
    fail("Apache-2.0 LICENSE is missing")
license_text = license_path.read_text(encoding="utf-8")
if "Apache License" not in license_text or "Version 2.0, January 2004" not in license_text:
    fail("root LICENSE is not the Apache License 2.0 text")
if 'license = "Apache-2.0"' not in cargo_manifest:
    fail("Cargo package license differs from Apache-2.0")
if '"license": "Apache-2.0"' not in package_manifest:
    fail("frontend package license differs from Apache-2.0")
if "Apache License 2.0" not in readme or "Apache License 2.0" not in handoff:
    fail("README or handoff license declaration differs from Apache-2.0")
if "RUSTSEC-2024-0429" not in security or "upstream-linux-transitive" not in security:
    fail("security policy does not track the accepted upstream advisory")
if "dependency-refresh-or-linux-distribution" not in security:
    fail("security policy does not define the upstream advisory review boundary")
if "RUSTSEC-2024-0429" not in roadmap:
    fail("distribution roadmap does not require upstream advisory review")

cargo_version = tomllib.loads(cargo_manifest).get("package", {}).get("version")
tauri_version = tauri_config.get("version")
versions = {
    "package.json": package_version,
    "src-tauri/Cargo.toml": cargo_version,
    "src-tauri/tauri.conf.json": tauri_version,
}
if len(set(versions.values())) != 1:
    fail(f"release versions are not aligned: {versions}")

release_notes_path = ROOT / "docs" / "releases" / f"v{package_version}.md"
if not release_notes_path.is_file():
    fail(f"release notes are missing for v{package_version}")
release_notes = release_notes_path.read_text(encoding="utf-8")
for artifact in (
    f"jjcat_{package_version}_aarch64.app.zip",
    f"jjcat_{package_version}_aarch64.dmg",
    f"jjcat_{package_version}_aarch64.app.tar.gz",
    f"jjcat_{package_version}_aarch64.app.tar.gz.sig",
    "latest-beta.json",
    "SHA256SUMS",
):
    if artifact not in release_notes:
        fail(f"release notes do not document {artifact}")
if package_version == "0.9.1" and "`v0.9.0`에는 updater가 없으므로" not in release_notes:
    fail("bootstrap release notes do not explain the v0.9.0 manual-install boundary")
version_parts = package_version.split(".")
if len(version_parts) == 3 and all(part.isdigit() for part in version_parts):
    major, minor, patch = (int(part) for part in version_parts)
    if patch > 0:
        previous_version = f"{major}.{minor}.{patch - 1}"
        if f"## v{previous_version}에서 업데이트하기" not in release_notes:
            fail(
                "follow-up release notes do not explain the "
                f"v{previous_version} update path"
            )

bundle = tauri_config.get("bundle", {})
if bundle.get("active") is not True:
    fail("Tauri bundling is not active")
if set(bundle.get("targets", [])) != {"app", "dmg"}:
    fail("Tauri bundle targets must be app and dmg for the macOS beta")
macos_bundle = bundle.get("macOS", {})
if macos_bundle.get("minimumSystemVersion") != "13.0":
    fail("Tauri macOS minimum system version must match the macOS 13 beta contract")
if macos_bundle.get("signingIdentity") != "-":
    fail("Tauri macOS signing identity must use the ad-hoc pseudo-identity")
if macos_bundle.get("hardenedRuntime") is not True:
    fail("Tauri macOS hardened runtime must be enabled")

for fragment in (
    "tags:",
    '"v*"',
    "runs-on: macos-15",
    "scripts/check-release-version.py",
    "scripts/check.sh",
    "name: Require beta updater credentials",
    "JJCAT_UPDATER_PUBLIC_KEY",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    "scripts/create-updater-config.py",
    'pnpm tauri build --bundles app --config "$JJCAT_UPDATER_CONFIG"',
    "scripts/package-macos-release.sh",
    "scripts/verify-macos-release.sh",
    "softprops/action-gh-release@v3",
    "body_path: docs/releases/${{ github.ref_name }}.md",
    "files: release-dist/*",
    "prerelease: true",
    "fail_on_unmatched_files: true",
    "gh release view updater-beta",
    "gh release upload",
    "release-dist/latest-beta.json",
    "--clobber",
    "gh release create",
):
    if fragment not in release_workflow:
        fail(f"release workflow is missing {fragment!r}")

credential_preflight = release_workflow.index("name: Require beta updater credentials")
updater_configuration = release_workflow.index("name: Configure signed beta updater")
dependency_setup = release_workflow.index("name: Set up pnpm")
if not credential_preflight < updater_configuration < dependency_setup:
    fail("updater credential/config preflight must run before macOS dependency setup")
configuration_block = release_workflow[updater_configuration:dependency_setup]
if "TAURI_SIGNING_PRIVATE_KEY" in configuration_block:
    fail("updater config generation must not receive the private signing key")

for fragment in (
    '"@tauri-apps/plugin-process": "~2.3.1"',
    '"@tauri-apps/plugin-updater": "~2.10.1"',
):
    if fragment not in package_manifest:
        fail(f"frontend updater dependency is missing {fragment!r}")

for fragment in (
    'tauri-plugin-process = "2.3.1"',
    'tauri-plugin-updater = "2.10.1"',
    'minisign-verify = "0.2.5"',
):
    if fragment not in cargo_manifest:
        fail(f"native updater dependency is missing {fragment!r}")

permissions = set(tauri_capabilities.get("permissions", []))
if not {
    "updater:default",
    "process:allow-restart",
    "core:window:allow-show",
    "core:window:allow-set-focus",
} <= permissions:
    fail("Tauri capabilities do not grant the bounded updater and restart permissions")

for fragment, source_name, source in (
    ("appUpdater.check", "App.tsx", app_source),
    ("appUpdateActionModel", "App.tsx", app_source),
    ("jjcat://check-for-updates", "appUpdater.ts", app_updater_source),
    ("downloadAndInstall", "appUpdater.ts", app_updater_source),
    ("return relaunch()", "appUpdater.ts", app_updater_source),
    ("clearLegacyAppUpdateRelaunchFocus", "main.tsx", main_source),
    ("Download jjcat", "appUpdate.ts", app_update_state),
    ("Restart to update", "appUpdate.ts", app_update_state),
    ("tauri_plugin_updater::Builder", "src-tauri/src/lib.rs", tauri_source),
    ("tauri_plugin_process::init", "src-tauri/src/lib.rs", tauri_source),
    ("tauri::RunEvent::Ready", "src-tauri/src/lib.rs", tauri_source),
    ('get_webview_window("main")', "src-tauri/src/lib.rs", tauri_source),
    ("Check for Updates…", "src-tauri/src/lib.rs", tauri_source),
):
    if fragment not in source:
        fail(f"{source_name} is missing updater contract fragment {fragment!r}")

for fragment in (
    "APPLE_CERTIFICATE",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_TEAM_ID",
    "tauri-apps/tauri-action",
    "pnpm tauri bundle --bundles dmg",
    "runs-on: macos-14",
    "scripts/sign-macos-adhoc.sh",
    "--allow-insecure-localhost",
    "dangerousInsecureTransportProtocol",
):
    if fragment in release_workflow:
        fail(f"unsigned public beta workflow must not contain {fragment!r}")

for fragment in (
    "name: Install Jujutsu",
    "JJCAT_JJ_VERSION: 0.43.0",
    "JJCAT_JJ_X86_64_LINUX_SHA256: 59e5588583ac82b623239929368c65b90735931c0f26b5a16c1f04d5bb97643d",
    "sha256sum --check --strict",
    '"$jj_bin_dir/jj" --version',
):
    if fragment not in ci_workflow:
        fail(f"CI Jujutsu prerequisite is missing {fragment!r}")

for fragment in (
    "name: Install Jujutsu",
    "JJCAT_JJ_VERSION: 0.43.0",
    "JJCAT_JJ_AARCH64_MACOS_SHA256: 84336bbe5673a36ccc6395c494021ba632794da078eb8c8c513a60f8e1cc3083",
    "aarch64-apple-darwin.tar.gz",
    "shasum -a 256 --check",
    '"$jj_bin_dir/jj" --version',
):
    if fragment not in release_workflow:
        fail(f"release Jujutsu prerequisite is missing {fragment!r}")

markdown_link_pattern = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
markdown_paths = set(ROOT.glob("*.md"))
markdown_paths.update((ROOT / "docs").rglob("*.md"))
markdown_paths.update((ROOT / ".github").rglob("*.md"))
for path in sorted(markdown_paths):
    relative = path.relative_to(ROOT)
    text = path.read_text(encoding="utf-8")
    for raw_target in markdown_link_pattern.findall(text):
        target = raw_target.strip().strip("<>").split(maxsplit=1)[0]
        if not target or target.startswith("#") or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
            continue
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if target.startswith("/"):
            fail(f"{relative} contains an absolute local Markdown target")
        resolved = (path.parent / target).resolve()
        if resolved != ROOT and ROOT not in resolved.parents:
            fail(f"{relative} links outside the repository: {target}")
        if not resolved.exists():
            fail(f"{relative} contains a broken Markdown link: {target}")

todo_dirs = sorted(path for path in (ROOT / "docs").glob("todo-*") if path.is_dir())

active_count = 0
active_specs: list[str] = []
required_spec_headings = (
    "## Goal",
    "## Context",
    "## Scope",
    "## Constraints",
    "## Acceptance Checklist",
    "## Required Evidence",
    "## Publication Impact",
    "## Out Of Scope",
    "## Completion Rule",
)
for heading in required_spec_headings:
    if heading not in start_work:
        fail(f"start-work template is missing {heading}")

for todo_dir in todo_dirs:
    for filename in ("spec.md", "open-questions.md"):
        path = todo_dir / filename
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"{todo_dir.name} is missing {filename}")
    spec = (todo_dir / "spec.md").read_text(encoding="utf-8")
    for heading in required_spec_headings:
        if heading not in spec:
            fail(f"{todo_dir.name}/spec.md is missing {heading}")
    if re.search(r"^Status: active$", spec, re.MULTILINE):
        active_count += 1
        active_specs.append(str((todo_dir / "spec.md").relative_to(ROOT)))

manifest_active = re.search(r"^active_work: ([^\s]+)$", manifest, re.MULTILINE)
if not manifest_active:
    fail("manifest does not declare active_work")
declared_active = manifest_active.group(1)
if declared_active == "none":
    if active_count != 0:
        fail(f"manifest declares no active work but found {active_count} active todo")
elif active_count != 1 or active_specs != [declared_active]:
    fail(f"manifest active_work differs from active todo: {active_specs}")

print("repository contract is valid")
