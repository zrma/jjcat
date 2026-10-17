import { describe, expect, it } from "vitest";
import { foldHistory, updateHistoryExpansion } from "./historyFolding";
import { historyFoldFocusTarget } from "./historyFocus";
import type { ChangeRow } from "../types";

const changes: ChangeRow[] = Array.from({ length: 80 }, (_, i) => ({
  changeId: `change-${i}`, commitId: `commit-${i}`, summary: "fixture", author: "fixture",
  updatedAt: "2026-01-01T00:00:00Z", parents: [], files: [], bookmarks: [], tags: [],
  workingCopy: i === 0, conflict: false, empty: false,
}));

describe("history fold focus targets", () => {
  it("follows the expanded control beyond the previous virtual window", () => {
    const before = foldHistory(changes, "change-0", new Set());
    const fold = before.find(item => item.kind === "fold")!;
    if (fold.kind !== "fold") throw new Error("fixture fold missing");
    const state = updateHistoryExpansion(changes, {
      revealedChangeIds: new Set(), contextAnchorChangeIds: new Set(),
    }, fold, fold.totalCount, "change-0");
    const after = foldHistory(changes, "change-0", state.revealedChangeIds);
    const target = historyFoldFocusTarget(after, fold.startIndex, "change-0");
    expect(target?.index).toBeGreaterThan(70);
    expect(target?.item).toMatchObject({ kind: "fold", hiddenCount: 0, shownCount: 78 });
  });

  it("finds a merged control after collapsing removes a temporary context anchor", () => {
    const before = foldHistory(changes, "change-30", new Set());
    const upper = before.find(item => item.kind === "fold")!;
    if (upper.kind !== "fold") throw new Error("fixture fold missing");
    const merged = foldHistory(changes, "change-0", new Set());
    const target = historyFoldFocusTarget(merged, upper.startIndex, "change-0");
    expect(target?.item).toMatchObject({ kind: "fold", startIndex: 2, endIndex: 79 });
    expect(target?.item).not.toEqual(upper);
  });

  it("falls back to the selected row when a collapsed control disappears", () => {
    const items = foldHistory(changes, "change-3", new Set());
    const target = historyFoldFocusTarget(items, 2, "change-3");
    expect(target?.item).toMatchObject({ kind: "change", change: { changeId: "change-3" } });
  });

  it("uses the first change if the selection no longer exists", () => {
    const items = foldHistory(changes, "change-0", new Set());
    expect(historyFoldFocusTarget(items, 0, "missing")?.index).toBe(0);
  });

  it("does not request focus for an empty history", () => {
    expect(historyFoldFocusTarget([], 0, "change-0")).toBeNull();
  });
});
