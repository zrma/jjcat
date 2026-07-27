import type {
  MutationIntent,
  MutationPreview,
} from "../types";

type MutationCommandContext = Pick<MutationPreview, "candidates" | "targets">;

const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

function quoteArgument(value: string) {
  if (value.length === 0) return "''";
  if (SAFE_ARGUMENT.test(value)) return value;
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function command(args: string[]) {
  return ["jj", ...args].map(quoteArgument).join(" ");
}

function exactFileFileset(path: string) {
  return `root-file:"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function workspaceCommitId(context?: MutationCommandContext) {
  return context?.targets.find(
    (target) => target.label === "Working-copy change",
  )?.commitId;
}

export function jjMutationCommands(
  intent: MutationIntent,
  context?: MutationCommandContext,
): string[] {
  switch (intent.kind) {
    case "new":
      return [command(["new", "--", ...intent.parentCommitIds])];
    case "edit":
      return [command(["edit", intent.targetCommitId])];
    case "describe":
      return [
        command([
          "describe",
          intent.targetCommitId,
          "--message",
          intent.message,
        ]),
      ];
    case "fetch":
      return [
        command(
          intent.remote
            ? ["git", "fetch", "--remote", `exact:${intent.remote}`]
            : ["git", "fetch", "--all-remotes"],
        ),
      ];
    case "rebase":
      return [
        command([
          "rebase",
          "--revisions",
          intent.sourceCommitId,
          "--onto",
          intent.destinationCommitId,
        ]),
      ];
    case "squash":
      return [
        command([
          "squash",
          "--from",
          intent.sourceCommitId,
          "--into",
          intent.destinationCommitId,
          "--use-destination-message",
        ]),
      ];
    case "split":
      return [
        command([
          "split",
          "--revision",
          intent.sourceCommitId,
          "--message",
          intent.message,
          "--",
          ...intent.paths.map(exactFileFileset),
        ]),
      ];
    case "abandon":
      return [command(["abandon", "--", ...intent.targetCommitIds])];
    case "pruneEmpty":
      return [
        command([
          "abandon",
          "--",
          ...(context?.candidates.map((candidate) => candidate.commitId) ?? []),
        ]),
      ];
    case "removeWorkspace": {
      const commands = [
        command(["workspace", "forget", "--", intent.name]),
      ];
      const commitId = workspaceCommitId(context);
      if (commitId) commands.push(command(["abandon", commitId]));
      return commands;
    }
    case "undo":
      return [command(["undo"])];
    case "redo":
      return [command(["redo"])];
    case "bookmarkMove":
      return [
        command([
          "bookmark",
          "set",
          "--allow-backwards",
          "--revision",
          intent.targetCommitId,
          "--",
          intent.name,
        ]),
      ];
    case "push":
      return [
        command([
          "git",
          "push",
          "--remote",
          intent.remote,
          "--bookmark",
          `exact:${intent.name}`,
        ]),
      ];
  }
}

export function jjGitInitializationCommands(): string[] {
  return [command(["git", "init", "--colocate", "."])];
}
