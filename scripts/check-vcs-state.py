#!/usr/bin/env python3
"""main 이력과 명시적으로 종료하는 로컬 작업의 잔여물을 검사한다."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


class StateError(Exception):
    pass


def query(root: Path, *args: str, optional: bool = False) -> str:
    try:
        result = subprocess.run(args, cwd=root, capture_output=True, text=True)
    except FileNotFoundError as error:
        if optional:
            return ""
        raise StateError(f"required command is unavailable: {args[0]}") from error
    if result.returncode:
        if optional:
            return ""
        raise StateError(f"{args[0]} query failed; cannot verify repository state")
    return result.stdout.rstrip("\n")


def jj(root: Path, *args: str) -> str:
    return query(root, "jj", "--no-pager", *args)


def revision_id(root: Path, revision: str, native: bool) -> str:
    if native:
        commits = jj(root, "log", "-r", revision, "--no-graph", "-T", 'commit_id ++ "\n"').splitlines()
        if len(commits) != 1:
            raise StateError("revision must resolve to exactly one commit")
        return commits[0]
    return query(root, "git", "rev-parse", "--verify", f"{revision}^{{commit}}")


def check_history(root: Path, revision: str | None) -> tuple[str, bool]:
    native = bool(query(root, "jj", "root", optional=True))
    if native:
        target = revision_id(root, revision or "main", True)
        merges = jj(root, "log", "-r", f"ancestors({target}) & merges()", "--no-graph", "-T", 'commit_id ++ "\n"')
    else:
        if query(root, "git", "rev-parse", "--is-shallow-repository") != "false":
            raise StateError("full history is required; use fetch-depth: 0")
        if revision is None:
            revision = "main" if query(root, "git", "rev-parse", "--verify", "refs/heads/main", optional=True) else "origin/main"
        target = revision_id(root, revision, False)
        merges = query(root, "git", "rev-list", "--min-parents=2", target)
    if merges:
        raise StateError("main history must be linear; merge commits were found")
    return target, native


def check_closeout(root: Path, target: str, keep: set[str], retired_paths: list[Path]) -> None:
    if jj(root, "log", "-r", "@", "--no-graph", "-T", "empty") != "true":
        raise StateError("current working copy is not empty")
    parents = jj(root, "log", "-r", "parents(@)", "--no-graph", "-T", 'commit_id ++ "\n"').splitlines()
    if parents != [target]:
        raise StateError("current working copy must have exactly the expected parent")

    records = jj(root, "workspace", "list", "-T", r'name ++ "\0" ++ root ++ "\n"')
    workspaces = {}
    for line in records.splitlines():
        name, separator, path = line.partition("\0")
        if not separator or not path:
            raise StateError("workspace root metadata is missing")
        workspaces[name] = Path(path).resolve()
    if keep - workspaces.keys():
        raise StateError("a retained workspace does not exist")
    if workspaces.keys() - keep:
        raise StateError("unclassified secondary workspaces remain; retain active work explicitly")
    if any(not path.is_dir() for path in workspaces.values()):
        raise StateError("workspace registration points to a missing directory")
    if root.resolve() not in workspaces.values():
        raise StateError("current workspace is not registered")

    orphans = jj(root, "log", "-r", "heads(all()) ~ (bookmarks() | tags() | working_copies())", "--no-graph", "-T", 'commit_id ++ "\n"')
    if orphans:
        raise StateError("unreferenced heads remain; classify and preserve unique work before cleanup")

    # Git 등록, jj 등록, 실제 디렉터리는 서로 별개로 확인한다.
    if (root / ".git").exists() or (root / ".git").is_symlink():
        query(root, "git", "rev-parse", "--git-dir")
        records = query(root, "git", "worktree", "list", "--porcelain", "-z")
        paths = {
            Path(field.removeprefix("worktree ")).resolve()
            for record in records.split("\0\0")
            for field in record.split("\0")
            if field.startswith("worktree ")
        }
        if paths - set(workspaces.values()):
            raise StateError("unclassified Git worktree registrations remain")
    if any(path.exists() or path.is_symlink() for path in retired_paths):
        raise StateError("a task-owned directory marked for retirement still exists")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--revision", help="single proposed commit; defaults to main")
    parser.add_argument("--closeout", action="store_true", help="also inspect local working copy and residual state")
    parser.add_argument("--keep-workspace", action="append", default=[], help="explicitly retain an active secondary workspace")
    parser.add_argument("--retired-path", type=Path, action="append", default=[], help="task-owned directory that must be absent")
    args = parser.parse_args()
    if not args.closeout and (args.keep_workspace or args.retired_path):
        parser.error("retention and retirement arguments require --closeout")
    try:
        root = args.repo_root.resolve()
        target, native = check_history(root, args.revision)
        if args.closeout:
            if not native:
                raise StateError("local closeout requires a jj workspace")
            check_closeout(root, target, {"default", *args.keep_workspace}, [p.absolute() for p in args.retired_path])
    except StateError as error:
        print(f"VCS state check failed: {error}", file=sys.stderr)
        return 1
    print("VCS state check passed: linear history" + (", clean local closeout" if args.closeout else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
