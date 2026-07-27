import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import { foldHistory, HISTORY_REVEAL_STEP } from "./historyFolding";

function change(
  changeId: string,
  options: Partial<ChangeRow> = {},
): ChangeRow {
  return {
    changeId,
    commitId: changeId,
    summary: changeId,
    author: "fixture",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks: [],
    parents: [],
    files: [],
    conflict: false,
    workingCopy: false,
    empty: false,
    ...options,
  };
}

describe("foldHistory", () => {
  it("keeps reference neighborhoods visible and folds distant linear history", () => {
    const changes = Array.from({ length: 24 }, (_, index) =>
      change(`change-${index}`, {
        workingCopy: index === 0,
        bookmarks: index === 12 ? [{ name: "main", remote: null }] : [],
      }),
    );

    const items = foldHistory(changes, undefined, {});
    const visibleIds = items
      .filter((item) => item.kind === "change")
      .map((item) => item.change.changeId);
    const folds = items.filter((item) => item.kind === "fold");

    expect(visibleIds).toEqual([
      "change-0",
      "change-1",
      "change-11",
      "change-12",
      "change-13",
    ]);
    expect(folds.map((fold) => fold.hiddenCount)).toEqual([9, 10]);
  });

  it("reveals a bounded batch and preserves a control row for collapsing", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );
    const collapsed = foldHistory(changes, undefined, {});
    const fold = collapsed.find((item) => item.kind === "fold");
    expect(fold?.hiddenCount).toBe(28);

    const revealed = foldHistory(changes, undefined, {
      [fold!.id]: HISTORY_REVEAL_STEP,
    });
    const updatedFold = revealed.find((item) => item.kind === "fold");
    expect(updatedFold?.shownCount).toBe(HISTORY_REVEAL_STEP);
    expect(updatedFold?.hiddenCount).toBe(18);

    const expanded = foldHistory(changes, undefined, {
      [fold!.id]: fold!.totalCount,
    });
    const expandedFold = expanded.find((item) => item.kind === "fold");
    expect(expandedFold?.hiddenCount).toBe(0);
    expect(expandedFold?.shownCount).toBe(28);
  });

  it("preserves an explicit expansion when selecting a revealed change", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );
    const collapsed = foldHistory(changes, undefined, {});
    const fold = collapsed.find((item) => item.kind === "fold");
    const revealedByGap = { [fold!.id]: HISTORY_REVEAL_STEP };

    const beforeSelection = foldHistory(changes, undefined, revealedByGap);
    const afterSelection = foldHistory(
      changes,
      "change-8",
      revealedByGap,
    );

    expect(afterSelection).toEqual(beforeSelection);
    expect(afterSelection.find((item) => item.kind === "fold")).toMatchObject({
      id: fold!.id,
      shownCount: HISTORY_REVEAL_STEP,
      hiddenCount: 18,
    });
  });

  it("keeps a selected hidden change visible without expanding its whole gap", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );

    const items = foldHistory(changes, "change-20", {});
    const visibleIds = items
      .filter((item) => item.kind === "change")
      .map((item) => item.change.changeId);

    expect(visibleIds).toEqual([
      "change-0",
      "change-1",
      "change-19",
      "change-20",
      "change-21",
    ]);
    expect(items.filter((item) => item.kind === "fold")).toHaveLength(2);
  });

  it("shows search results unchanged when folding is disabled", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`),
    );

    expect(foldHistory(changes, undefined, {}, false)).toHaveLength(30);
  });

  it("keeps temporary preview anchors visible without permanently expanding gaps", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );

    const items = foldHistory(
      changes,
      undefined,
      {},
      true,
      ["change-18"],
    );
    const visibleIds = items
      .filter((item) => item.kind === "change")
      .map((item) => item.change.changeId);

    expect(visibleIds).toContain("change-18");
    expect(visibleIds).toContain("change-17");
    expect(visibleIds).toContain("change-19");
    expect(items.some((item) => item.kind === "fold")).toBe(true);
  });
});
