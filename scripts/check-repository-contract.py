#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
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
    "scripts/check.sh",
    "scripts/finalize-change.sh",
    "scripts/start-work.sh",
    ".github/workflows/ci.yml",
    "package.json",
    "pnpm-lock.yaml",
    "src/App.tsx",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
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

if "All your jj repos, one window." not in readme:
    fail("README product identity is missing")
if "`P2: Graph and Diff`까지 완료됐다" not in status:
    fail("status does not record P2 completion")
if "다음 milestone은 P3 safe shaping" not in status:
    fail("status does not identify the next milestone boundary")
if "현재 content class는 `public`" not in status:
    fail("status does not declare the public tracked surface")
if "publication class는 public" not in handoff:
    fail("handoff does not declare the public tracked surface")
if "`jjcat`의 tracked repository surface는 `public`" not in publication:
    fail("publication policy does not declare the public tracked surface")
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
for fragment in (
    "name: Install Jujutsu",
    "JJCAT_JJ_VERSION: 0.43.0",
    "JJCAT_JJ_X86_64_LINUX_SHA256: 59e5588583ac82b623239929368c65b90735931c0f26b5a16c1f04d5bb97643d",
    "sha256sum --check --strict",
    '"$jj_bin_dir/jj" --version',
):
    if fragment not in ci_workflow:
        fail(f"CI Jujutsu prerequisite is missing {fragment!r}")

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
if not todo_dirs:
    fail("at least one docs/todo-* work directory is required")

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
