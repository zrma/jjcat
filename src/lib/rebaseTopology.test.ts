import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import {
  canPreviewRebase,
  estimateRebaseTopology,
} from "./rebaseTopology";
import { foldHistory } from "./historyFolding";

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

  it("moves a source before a newer destination in the estimated order", () => {
    const reverseOrder = [
      row("destination", ["root"]),
      row("source-child", ["source"]),
      row("source", ["root"]),
      row("root", []),
    ];

    const preview = estimateRebaseTopology(
      reverseOrder,
      "source-commit",
      "destination-commit",
    );

    expect(preview?.changes.map((change) => change.changeId)).toEqual([
      "source-child",
      "source",
      "destination",
      "root",
    ]);
    expect(
      preview?.changes.find((change) => change.changeId === "source")?.parents,
    ).toEqual(["destination"]);
    expect(preview?.affectedChangeIds).toEqual(
      new Set(["source-child", "source", "destination"]),
    );
  });

  it("does not mark unrelated rows as affected after an upward move", () => {
    const reverseOrder = [
      row("destination", ["root"]),
      row("unrelated", ["root"]),
      row("source", ["root"]),
      row("root", []),
    ];
    const preview = estimateRebaseTopology(
      reverseOrder,
      "source-commit",
      "destination-commit",
    );

    expect(preview?.affectedChangeIds).toEqual(
      new Set(["source", "destination"]),
    );
    expect(preview?.affectedChangeIds.has("unrelated")).toBe(false);
    expect(preview?.affectedChangeIds.has("root")).toBe(false);
  });

  it("keeps both ends visible after the proposed order is folded", () => {
    const linearHistory = Array.from({ length: 24 }, (_, index) =>
      row(`history-${index}`, [
        index === 23 ? "root" : `history-${index + 1}`,
      ]),
    );
    const upwardMove = [
      row("destination", ["history-0"]),
      ...linearHistory,
      row("source", ["root"]),
      row("root", []),
    ];
    const preview = estimateRebaseTopology(
      upwardMove,
      "source-commit",
      "destination-commit",
    );
    const items = foldHistory(
      preview!.changes,
      undefined,
      {},
      true,
      ["source", "destination"],
    );
    const visibleIds = items
      .filter((item) => item.kind === "change")
      .map((item) => item.change.changeId);

    expect(preview?.changes[0].changeId).toBe("source");
    expect(visibleIds).toContain("source");
    expect(visibleIds).toContain("destination");
    expect(items.some((item) => item.kind === "fold")).toBe(true);
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
