import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import {
  historyDropLaunch,
  type HistoryDragIntent,
} from "./historyDrag";

function row(
  changeId: string,
  parents: string[],
  bookmarks: ChangeRow["bookmarks"] = [],
): ChangeRow {
  return {
    changeId,
    commitId: `${changeId}-commit`,
    summary: changeId,
    author: "fixture",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks,
    parents,
    parentCommitIds: parents.map((parent) => `${parent}-commit`),
    files: [],
    conflict: false,
    workingCopy: false,
    empty: false,
  };
}

describe("historyDropLaunch", () => {
  const changes = [
    row("head", ["source"]),
    row("source", ["old-parent"], [{ name: "feature", remote: null }]),
    row("destination", ["root"]),
    row("old-parent", ["root"]),
    { ...row("root", []), commitId: "000000000000" },
  ];

  it("keeps a change-row drag on the rebase workflow", () => {
    const drag: HistoryDragIntent = {
      kind: "rebase",
      sourceCommitId: "source-commit",
    };

    expect(
      historyDropLaunch(changes, drag, "destination-commit"),
    ).toEqual({
      intent: {
        kind: "rebase",
        sourceCommitId: "source-commit",
        destinationCommitId: "destination-commit",
      },
      previewImmediately: false,
    });
    expect(historyDropLaunch(changes, drag, "head-commit")).toBeNull();
  });

  it("moves only an existing local bookmark through the exact preview", () => {
    const drag: HistoryDragIntent = {
      kind: "bookmarkMove",
      name: "feature",
      sourceCommitId: "source-commit",
    };

    expect(
      historyDropLaunch(changes, drag, "destination-commit"),
    ).toEqual({
      intent: {
        kind: "bookmarkMove",
        name: "feature",
        targetCommitId: "destination-commit",
      },
      previewImmediately: true,
    });
  });

  it("rejects same-position, root, missing, and remote-only bookmark drops", () => {
    const localDrag: HistoryDragIntent = {
      kind: "bookmarkMove",
      name: "feature",
      sourceCommitId: "source-commit",
    };
    const remoteDrag: HistoryDragIntent = {
      kind: "bookmarkMove",
      name: "feature",
      sourceCommitId: "destination-commit",
    };

    expect(
      historyDropLaunch(changes, localDrag, "source-commit"),
    ).toBeNull();
    expect(
      historyDropLaunch(changes, localDrag, "000000000000"),
    ).toBeNull();
    expect(historyDropLaunch(changes, localDrag, "missing")).toBeNull();
    expect(
      historyDropLaunch(changes, remoteDrag, "old-parent-commit"),
    ).toBeNull();
  });
});
