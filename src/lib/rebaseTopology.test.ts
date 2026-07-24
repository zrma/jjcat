import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import {
  canPreviewRebase,
  estimateRebaseTopology,
} from "./rebaseTopology";

function row(changeId: string, parents: string[]): ChangeRow {
  return {
    changeId,
    commitId: `${changeId}-commit`,
    summary: changeId,
    author: "fixture",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks: [],
    parents,
    parentCommitIds: parents.map((parent) => `${parent}-commit`),
    files: [],
    conflict: false,
    workingCopy: false,
    empty: false,
  };
}

describe("estimated rebase topology", () => {
  const changes = [
    row("head", ["source"]),
    row("source", ["old-parent"]),
    row("destination", ["root"]),
    row("old-parent", ["root"]),
    row("root", []),
  ];

  it("reparents only the source change without mutating the projection", () => {
    const preview = estimateRebaseTopology(
      changes,
      "source-commit",
      "destination-commit",
    );

    expect(preview?.source.changeId).toBe("source");
    expect(preview?.destination.changeId).toBe("destination");
    expect(
      preview?.changes.find((change) => change.changeId === "source")?.parents,
    ).toEqual(["destination"]);
    expect(changes[1].parents).toEqual(["old-parent"]);
  });

  it("rejects a destination below the source because it would create a cycle", () => {
    expect(
      canPreviewRebase(changes, "source-commit", "head-commit"),
    ).toBe(false);
    expect(
      estimateRebaseTopology(changes, "source-commit", "head-commit"),
    ).toBeNull();
  });

  it("rejects missing, root, and same-node sources", () => {
    const root = { ...row("virtual-root", []), commitId: "000000000000" };
    const withRoot = [...changes, root];

    expect(canPreviewRebase(withRoot, "missing", "root-commit")).toBe(false);
    expect(
      canPreviewRebase(withRoot, "source-commit", "source-commit"),
    ).toBe(false);
    expect(
      canPreviewRebase(withRoot, root.commitId, "destination-commit"),
    ).toBe(false);
  });
});
