import { describe, expect, it } from "vitest";
import {
  jjGitInitializationCommands,
  jjMutationCommands,
} from "./jjCommand";

describe("jj command summaries", () => {
  it("shows an exact fetch command without its execution wrapper", () => {
    expect(
      jjMutationCommands({ kind: "fetch", remote: "origin" }),
    ).toEqual(["jj git fetch --remote exact:origin"]);
  });

  it("quotes description messages for a pasteable command", () => {
    expect(
      jjMutationCommands({
        kind: "describe",
        targetCommitId: "abc123",
        message: "fix: don't blink",
      }),
    ).toEqual([
      `jj describe abc123 --message 'fix: don'"'"'t blink'`,
    ]);
  });

  it("matches the driver's exact root-file filesets", () => {
    expect(
      jjMutationCommands({
        kind: "split",
        sourceCommitId: "abc123",
        message: "split docs",
        paths: ['docs/a "quoted".md'],
      }),
    ).toEqual([
      `jj split --revision abc123 --message 'split docs' -- 'root-file:"docs/a \\"quoted\\".md"'`,
    ]);
  });

  it("uses the exact previewed prune candidates", () => {
    expect(
      jjMutationCommands(
        { kind: "pruneEmpty" },
        {
          candidates: [
            { changeId: "a", commitId: "111", summary: "" },
            { changeId: "b", commitId: "222", summary: "" },
          ],
          targets: [],
        },
      ),
    ).toEqual(["jj abandon -- 111 222"]);
  });

  it("shows both jj commands used to remove a workspace", () => {
    expect(
      jjMutationCommands(
        { kind: "removeWorkspace", name: "finished-work" },
        {
          candidates: [],
          targets: [
            {
              label: "Working-copy change",
              value: "change",
              commitId: "abc123",
            },
          ],
        },
      ),
    ).toEqual([
      "jj workspace forget -- finished-work",
      "jj abandon abc123",
    ]);
  });

  it("shows the colocated Git repository onboarding command", () => {
    expect(jjGitInitializationCommands()).toEqual([
      "jj git init --colocate .",
    ]);
  });
});
