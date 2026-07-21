#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


SAFE_HOME_USERS = {
    "example",
    "linuxbrew",
    "local-user",
    "me",
    "runner",
    "tester",
    "user",
    "you",
}
DOCUMENTATION_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)


@dataclass(frozen=True, order=True)
class Finding:
    path: str
    line: int
    kind: str


def run(root: Path, command: list[str]) -> str:
    completed = subprocess.run(
        command,
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines()
        summary = detail[-1] if detail else f"exit {completed.returncode}"
        raise RuntimeError(f"{command[0]} failed: {summary}")
    return completed.stdout


def repository_root(cwd: Path) -> Path:
    if shutil.which("jj") is not None:
        try:
            return Path(run(cwd, ["jj", "workspace", "root"]).strip())
        except RuntimeError:
            pass
    return Path(run(cwd, ["git", "rev-parse", "--show-toplevel"]).strip())


def tracked_files(root: Path) -> list[str]:
    if shutil.which("jj") is not None and (root / ".jj").exists():
        try:
            return [line for line in run(root, ["jj", "file", "list"]).splitlines() if line]
        except RuntimeError:
            pass
    return [item for item in run(root, ["git", "ls-files", "-z"]).split("\0") if item]


def publication_class(root: Path) -> str:
    document = (root / "docs" / "agent-harness.md").read_text(encoding="utf-8")
    matches = re.findall(r"^- Publication class: `(public|internal)`\.$", document, re.MULTILINE)
    if len(matches) != 1:
        raise RuntimeError("docs/agent-harness.md must declare exactly one publication class")
    return matches[0]


def visibility_from_payload(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None
    repository = payload.get("repository") or {}
    if not isinstance(repository, dict):
        return None
    visibility = str(repository.get("visibility") or "").lower()
    if visibility:
        return "public" if visibility == "public" else "internal"
    if "private" in repository:
        return "internal" if repository["private"] else "public"
    return None


def live_visibility() -> str | None:
    value = os.environ.get("PUBLICATION_LIVE_VISIBILITY", "").strip().lower()
    if value:
        if value == "public":
            return "public"
        if value in {"private", "internal"}:
            return "internal"
        raise RuntimeError("PUBLICATION_LIVE_VISIBILITY must be public, private, or internal")

    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        return None
    payload = json.loads(Path(event_path).read_text(encoding="utf-8"))
    return visibility_from_payload(payload)


def visibility_is_compatible(content_class: str, live: str | None) -> bool:
    if live is None:
        return True
    if content_class == "public":
        return live in {"internal", "public"}
    return live == "internal"


def repository_identity(root: Path) -> tuple[str, str] | None:
    try:
        remote = run(root, ["git", "config", "--get", "remote.origin.url"]).strip()
    except RuntimeError:
        return None
    if not remote:
        return None
    match = re.search(r"(?:github\.com[/:])([^/]+)/([^/#]+?)(?:\.git)?$", remote)
    if not match:
        raise RuntimeError("configured origin must identify a GitHub owner/repository")
    return match.group(1), match.group(2)


def text_files(root: Path) -> Iterable[tuple[str, str]]:
    for relative in tracked_files(root):
        path = root / relative
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data:
            continue
        yield relative, data.decode("utf-8", errors="ignore")


def scan_text(
    relative: str,
    text: str,
    owner: str | None = None,
    repository: str | None = None,
) -> set[Finding]:
    findings: set[Finding] = set()
    home_pattern = re.compile(r"(?<![A-Za-z0-9_.-])/(?:Users|home)/([A-Za-z0-9._-]+)")
    windows_home_pattern = re.compile(r"(?i)(?<![A-Za-z0-9_.-])[A-Z]:\\Users\\([A-Za-z0-9._-]+)")
    ipv4_pattern = re.compile(r"(?<![0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9])")
    private_hostname_pattern = re.compile(
        r"(?i)\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\."
        r"(?:local|internal|lan|home\.arpa|ts\.net)\b"
    )
    raw_evidence_pattern = re.compile(
        r"(?i)(?:healthcheck|diagnostic|support-bundle|cluster-dump)[-_][0-9]{8}"
    )
    local_uri_pattern = re.compile(r"(?i)\b(?:file|vscode)://")
    agent_artifact_pattern = re.compile(
        r"(?i)(?:^|[/\\])\.(?:codex|claude)[/\\](?:sessions|memories|projects)(?:[/\\]|$)"
    )
    rollout_artifact_pattern = re.compile(
        r"(?i)\brollout-[0-9]{4}-[0-9]{2}-[0-9]{2}[^/\\\s]*\.jsonl\b"
    )
    secret_patterns = (
        ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
        ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
        ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    )

    if raw_evidence_pattern.search(relative):
        findings.add(Finding(relative, 1, "raw-runtime-evidence-path"))
    basename = Path(relative).name.lower()
    if basename in {".env", "id_dsa", "id_ecdsa", "id_ed25519", "id_rsa"} or basename.endswith(
        (".key", ".pem", ".p12", ".pfx")
    ):
        findings.add(Finding(relative, 1, "sensitive-tracked-path"))

    same_owner_pattern = None
    if owner and repository:
        same_owner_pattern = re.compile(
            rf"(?i)(?:https?://github\.com/|git@github\.com:)"
            rf"{re.escape(owner)}/(?!{re.escape(repository)}(?:\.git)?(?:$|[^A-Za-z0-9_.-]))"
            r"[A-Za-z0-9_.-]+"
        )

    for line_number, line in enumerate(text.splitlines(), start=1):
        for match in home_pattern.finditer(line):
            if match.group(1).lower() not in SAFE_HOME_USERS:
                findings.add(Finding(relative, line_number, "machine-local-home-path"))
        for match in windows_home_pattern.finditer(line):
            if match.group(1).lower() not in SAFE_HOME_USERS:
                findings.add(Finding(relative, line_number, "machine-local-home-path"))
        if private_hostname_pattern.search(line):
            findings.add(Finding(relative, line_number, "private-operations-hostname"))
        if raw_evidence_pattern.search(line):
            findings.add(Finding(relative, line_number, "raw-runtime-evidence-reference"))
        if local_uri_pattern.search(line):
            findings.add(Finding(relative, line_number, "machine-local-uri"))
        if agent_artifact_pattern.search(line) or rollout_artifact_pattern.search(line):
            findings.add(Finding(relative, line_number, "local-agent-artifact-reference"))
        if same_owner_pattern and same_owner_pattern.search(line):
            findings.add(Finding(relative, line_number, "same-owner-repository-url"))
        for kind, pattern in secret_patterns:
            if pattern.search(line):
                findings.add(Finding(relative, line_number, kind))
        for match in ipv4_pattern.finditer(line):
            try:
                address = ipaddress.ip_address(match.group(0))
            except ValueError:
                continue
            if (
                address.is_loopback
                or address.is_unspecified
                or any(address in network for network in DOCUMENTATION_NETWORKS)
            ):
                continue
            findings.add(Finding(relative, line_number, "specific-network-address"))
    return findings


def self_test() -> int:
    private_home = "/" + "/".join(("Users", "private-account", "src", "jjcat"))
    private_host = ".".join(("node-a", "private", "internal"))
    private_address = ".".join(("100", "64", "0", "12"))
    token = "gh" + "p_" + "A" * 24
    local_uri = "file" + ":///" + "/".join(("Users", "private-account", "src"))
    agent_artifact = "." + "codex" + "/sessions/rollout-private.jsonl"
    unsafe = (
        ("fixture", private_home),
        ("fixture", private_host),
        ("fixture", private_address),
        ("fixture", token),
        ("fixture", local_uri),
        ("fixture", agent_artifact),
        ("id_" + "rsa", "private key fixture"),
    )
    safe = (
        ("fixture", "Use <home>/<repo-root> and <private-host>."),
        ("fixture", "Documentation address: 192.0.2.10."),
        ("fixture", "No credential is stored."),
    )
    if any(not scan_text(path, text) for path, text in unsafe):
        print("self-test failed: an unsafe fixture was not detected", file=sys.stderr)
        return 1
    if any(scan_text(path, text) for path, text in safe):
        print("self-test failed: a safe fixture was rejected", file=sys.stderr)
        return 1
    if visibility_from_payload({"repository": {"visibility": "public"}}) != "public":
        print("self-test failed: public GitHub event was not recognized", file=sys.stderr)
        return 1
    if visibility_from_payload({"repository": {"private": True}}) != "internal":
        print("self-test failed: private GitHub event was not recognized", file=sys.stderr)
        return 1
    if not visibility_is_compatible("public", "internal"):
        print("self-test failed: public-ready content rejected a private remote", file=sys.stderr)
        return 1
    if not visibility_is_compatible("public", "public"):
        print("self-test failed: public-ready content rejected a public remote", file=sys.stderr)
        return 1
    if visibility_is_compatible("internal", "public"):
        print("self-test failed: internal content accepted a public remote", file=sys.stderr)
        return 1
    print("publication boundary repository gate self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate tracked-artifact publication safety.")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--stdin", action="store_true")
    parser.add_argument("--label", default="candidate")
    args = parser.parse_args()
    if args.self_test:
        return self_test()

    try:
        root = repository_root(Path.cwd())
        declared = publication_class(root)
        live = live_visibility()
        if not visibility_is_compatible(declared, live):
            raise RuntimeError(
                f"content class {declared} is incompatible with live visibility {live}"
            )

        owner = None
        repository = None
        if declared == "public":
            identity = repository_identity(root)
            if identity is not None:
                owner, repository = identity
                if repository != "jjcat":
                    raise RuntimeError("public origin repository name must be jjcat")

        if args.stdin:
            findings = scan_text(args.label, sys.stdin.read(), owner, repository)
        else:
            findings: set[Finding] = set()
            for relative, text in text_files(root):
                findings.update(scan_text(relative, text, owner, repository))

        if findings:
            for finding in sorted(findings):
                print(
                    f"publication boundary finding: path={finding.path} "
                    f"line={finding.line} class={finding.kind}",
                    file=sys.stderr,
                )
            print(f"publication boundary check failed: {len(findings)} redacted finding(s)", file=sys.stderr)
            return 1

        live_label = live or "unconfigured"
        print(
            "publication boundary check passed: "
            f"content_class={declared} live_visibility={live_label}"
        )
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(f"publication boundary check could not prove safety: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
