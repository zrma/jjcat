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
start_work = read("scripts/start-work.sh")

for fragment in (
    "name: jjcat",
    "publication_class: public",
    "content_standard: public-ready",
    "remote_visibility_policy: private-or-public",
    "remote_status: unconfigured",
    "license_status: undecided",
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
if "P1: Multi-repository Cockpit" not in status:
    fail("status does not identify the active milestone")
if "P0 read-only foundation은 완료" not in status:
    fail("status does not record P0 completion")
if "현재 content class는 `public`" not in status:
    fail("status does not declare the public tracked surface")
if "publication class는 public" not in handoff:
    fail("handoff does not declare the public tracked surface")
if "`jjcat`의 tracked repository surface는 `public`" not in publication:
    fail("publication policy does not declare the public tracked surface")
if (ROOT / "LICENSE").exists() or (ROOT / "LICENSE.md").exists():
    fail("manifest says license is undecided but a root license file exists")

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

if active_count != 1:
    fail(f"expected exactly one active todo, found {active_count}")
manifest_active = re.search(r"^active_work: ([^\s]+)$", manifest, re.MULTILINE)
if not manifest_active:
    fail("manifest does not declare active_work")
if active_specs != [manifest_active.group(1)]:
    fail(f"manifest active_work differs from active todo: {active_specs}")

print("repository contract is valid")
