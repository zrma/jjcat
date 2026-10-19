from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1]
CHECK = SCRIPTS / "check-vcs-state.py"


class RepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vcs-contract-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)

    def run_command(self, *args, ok=True):
        result = subprocess.run(args, cwd=self.root, env=self.env, text=True, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return result

    def check(self, *args, ok=True):
        result = self.run_command("python3", str(CHECK), "--repo-root", str(self.root), *args, ok=False)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result


class GitHistoryTests(RepositoryTest):
    def setUp(self):
        super().setUp()
        self.run_command("git", "init", "-q", "--initial-branch=main")
        self.run_command("git", "config", "user.name", "Fixture")
        self.run_command("git", "config", "user.email", "fixture@example.test")
        self.run_command("git", "config", "commit.gpgsign", "false")
        self.commit("baseline")

    def commit(self, name):
        (self.root / name).write_text(name)
        self.run_command("git", "add", name)
        self.run_command("git", "commit", "-qm", f"test: {name}")

    def merge(self):
        self.run_command("git", "checkout", "-qb", "side")
        self.commit("side")
        self.run_command("git", "checkout", "-q", "main")
        self.commit("main")
        self.run_command("git", "merge", "--no-ff", "side", "-qm", "test: merge")

    def test_linear_history_passes_and_merge_fails(self):
        self.check()
        self.merge()
        self.assertIn("merge commits", self.check(ok=False).stderr)

    def test_proposed_revision_is_checked_even_when_main_is_linear(self):
        initial = self.run_command("git", "rev-parse", "HEAD").stdout.strip()
        self.merge()
        merged = self.run_command("git", "rev-parse", "HEAD").stdout.strip()
        self.run_command("git", "checkout", "-q", "--detach", initial)
        self.run_command("git", "branch", "-f", "main", initial)
        self.check()
        self.check("--revision", merged, ok=False)

    def test_unrelated_release_tag_does_not_break_linear_main(self):
        initial = self.run_command("git", "rev-parse", "HEAD").stdout.strip()
        self.merge()
        self.run_command("git", "tag", "v0.0.1")
        self.run_command("git", "checkout", "-q", "--detach", initial)
        self.run_command("git", "branch", "-f", "main", initial)
        self.check()
        self.assertTrue(self.run_command("git", "rev-parse", "v0.0.1").stdout.strip())

    def test_shallow_clone_cannot_prove_linearity(self):
        self.commit("later")
        clone = self.base / "shallow"
        self.run_command("git", "clone", "-q", "--depth=1", self.root.as_uri(), str(clone))
        self.root = clone
        self.assertIn("full history", self.check(ok=False).stderr)

    def test_detached_ci_uses_origin_main_and_missing_revision_fails(self):
        self.run_command("git", "update-ref", "refs/remotes/origin/main", "HEAD")
        self.run_command("git", "checkout", "-q", "--detach")
        self.run_command("git", "branch", "-D", "main")
        self.check()
        self.check("--revision", "missing", ok=False)


@unittest.skipUnless(shutil.which("jj"), "jj is required for native closeout tests")
class JujutsuCloseoutTests(RepositoryTest):
    def setUp(self):
        super().setUp()
        self.run_command("jj", "git", "init", "--colocate")
        for key, value in (("user.name", "Fixture"), ("user.email", "fixture@example.test"), ("signing.behavior", "drop")):
            self.run_command("jj", "config", "set", "--repo", key, value)
        (self.root / "baseline").write_text("baseline")
        self.run_command("jj", "describe", "-m", "test: baseline")
        self.run_command("jj", "bookmark", "create", "main", "-r", "@")
        self.run_command("jj", "new", "main")

    def value(self, revision, template):
        return self.run_command("jj", "log", "-r", revision, "--no-graph", "-T", template).stdout.strip()

    def test_clean_default_passes_but_dirty_or_wrong_parent_fails(self):
        self.check("--closeout")
        (self.root / "pending").write_text("keep")
        self.assertIn("not empty", self.check("--closeout", ok=False).stderr)
        self.run_command("jj", "new")
        self.assertIn("expected parent", self.check("--closeout", ok=False).stderr)
        self.check("--closeout", "--revision", "@-")
        self.assertEqual((self.root / "pending").read_text(), "keep")

    def test_secondary_workspace_requires_explicit_retention_and_is_not_deleted(self):
        path = self.base / "active"
        self.run_command("jj", "workspace", "add", "--name", "active", "-r", "main", str(path))
        self.assertIn("secondary workspaces", self.check("--closeout", ok=False).stderr)
        self.check("--closeout", "--keep-workspace", "active")
        self.assertTrue(path.is_dir())

    def test_unreferenced_nonempty_head_requires_preservation(self):
        (self.root / "unique").write_text("preserve")
        self.run_command("jj", "describe", "-m", "test: unique work")
        tip = self.value("@", "commit_id")
        self.run_command("jj", "new", "main")
        self.assertIn("unreferenced heads", self.check("--closeout", ok=False).stderr)
        self.run_command("jj", "bookmark", "create", "feature/retained", "-r", tip)
        self.check("--closeout")
        self.assertIn("preserve", self.run_command("jj", "file", "show", "-r", tip, "unique").stdout)

    def test_unreferenced_empty_head_is_also_detected(self):
        self.run_command("jj", "new", "main", "-m", "test: unused empty head")
        self.run_command("jj", "new", "main")
        self.assertIn("unreferenced heads", self.check("--closeout", ok=False).stderr)

    def test_retired_clone_directory_and_dangling_link_are_detected(self):
        clone = self.base / "retired-clone"
        clone.mkdir()
        self.check("--closeout", "--retired-path", str(clone), ok=False)
        self.assertTrue(clone.is_dir())
        clone.rmdir()
        self.check("--closeout", "--retired-path", str(clone))
        clone.symlink_to(self.base / "absent")
        self.check("--closeout", "--retired-path", str(clone), ok=False)

    def test_git_worktree_registration_is_checked_separately(self):
        path = self.base / "git-only"
        self.run_command("git", "worktree", "add", "--detach", str(path), "main")
        self.assertIn("Git worktree", self.check("--closeout", ok=False).stderr)
        shutil.rmtree(path)
        self.assertIn("Git worktree", self.check("--closeout", ok=False).stderr)

    def prepare_finalizer(self, gate_exit=0):
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("finalize-change.sh", "check-vcs-state.py"):
            shutil.copyfile(SCRIPTS / name, scripts / name)
        runtime = self.root / ".ai-first"
        runtime.mkdir()
        shutil.copyfile(SCRIPTS.parent / ".ai-first/vcs.py", runtime / "vcs.py")
        gate = scripts / "check.sh"
        gate.write_text(f"#!/bin/sh\nexit {gate_exit}\n")
        gate.chmod(0o755)
        config = self.base / "codex"
        config.mkdir()
        (config / "commit-attribution").write_text("Fixture <fixture@example.test>\n")
        self.env["CODEX_HOME"] = str(config)

    def finalize(self, *args, ok=True):
        return self.run_command("bash", "scripts/finalize-change.sh", "--message", "fix: fixture change", *args, ok=ok)

    def test_finalizer_keeps_main_and_opens_an_empty_working_copy(self):
        self.prepare_finalizer()
        old_main = self.value("main", "commit_id")
        self.finalize()
        self.assertEqual(self.value("main", "commit_id"), old_main)
        self.assertEqual(self.value("@", "empty"), "true")
        self.assertEqual(self.value("parents(@)", "description").splitlines()[-1], "Co-authored-by: Fixture <fixture@example.test>")
        self.check("--closeout", "--revision", "@-")

    def test_gate_failure_stops_before_description_and_bookmark_changes(self):
        self.prepare_finalizer(gate_exit=17)
        before = self.value("main", "commit_id")
        description = self.value("@", "description")
        self.assertNotEqual(self.finalize("--bookmark", "main", ok=False).returncode, 0)
        self.assertEqual(self.value("main", "commit_id"), before)
        self.assertEqual(self.value("@", "description"), description)

    def test_explicit_main_move_requires_a_linear_candidate(self):
        self.prepare_finalizer()
        self.finalize("--bookmark", "main")
        self.assertEqual(self.value("main", "commit_id"), self.value("@-", "commit_id"))
        self.check("--closeout")

    def test_failed_attribution_helper_does_not_fall_back(self):
        self.prepare_finalizer()
        helper = self.base / "codex/skills/vcs-jj/scripts/describe_with_attribution.sh"
        helper.parent.mkdir(parents=True)
        helper.write_text("#!/bin/sh\nexit 19\n")
        helper.chmod(0o755)
        before = self.value("@", "description")
        self.assertEqual(self.finalize(ok=False).returncode, 19)
        self.assertEqual(self.value("@", "description"), before)

    def test_finalizer_rejects_a_merge_before_moving_main(self):
        self.prepare_finalizer()
        main = self.value("main", "commit_id")
        left = self.value("@", "commit_id")
        self.run_command("jj", "new", "main")
        (self.root / "right").write_text("right")
        right = self.value("@", "commit_id")
        self.run_command("jj", "new", left, right)
        (self.root / "merge-edit").write_text("merge")
        result = self.finalize("--bookmark", "main", ok=False)
        self.assertIn("merge commits", result.stderr)
        self.assertEqual(self.value("main", "commit_id"), main)

    def test_finalizer_refuses_an_empty_change_without_creating_another_head(self):
        self.prepare_finalizer()
        self.run_command("jj", "describe", "-m", "test: local tools")
        self.run_command("jj", "new")
        before = self.value("@", "commit_id")
        result = self.finalize(ok=False)
        self.assertIn("empty working copy", result.stderr)
        self.assertEqual(self.value("@", "commit_id"), before)


if __name__ == "__main__":
    unittest.main()
