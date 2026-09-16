import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import { foldHistory, revealHistoryFold, updateHistoryExpansion, type HistoryExpansion, HISTORY_REVEAL_STEP } from "./historyFolding";

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
    tags: [],
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

    const items = foldHistory(changes, undefined, new Set());
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

  it("keeps tagged revision neighborhoods visible", () => {
    const changes = Array.from({ length: 24 }, (_, index) =>
      change(`change-${index}`, {
        workingCopy: index === 0,
        tags: index === 12 ? ["v0.9.15"] : [],
      }),
    );

    const visibleIds = foldHistory(changes, undefined, new Set())
      .filter((item) => item.kind === "change")
      .map((item) => item.change.changeId);

    expect(visibleIds).toEqual([
      "change-0",
      "change-1",
      "change-11",
      "change-12",
      "change-13",
    ]);
  });

  it("reveals a bounded batch and preserves a control row for collapsing", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );
    const collapsed = foldHistory(changes, undefined, new Set());
    const fold = collapsed.find((item) => item.kind === "fold");
    expect(fold?.hiddenCount).toBe(28);

    const revealed = foldHistory(changes, undefined,
      revealHistoryFold(changes, new Set(), fold!, HISTORY_REVEAL_STEP),
    );
    const updatedFold = revealed.find((item) => item.kind === "fold");
    expect(updatedFold?.shownCount).toBe(HISTORY_REVEAL_STEP);
    expect(updatedFold?.hiddenCount).toBe(18);

    const expanded = foldHistory(changes, undefined,
      revealHistoryFold(changes, new Set(), fold!, fold!.totalCount),
    );
    const expandedFold = expanded.find((item) => item.kind === "fold");
    expect(expandedFold?.hiddenCount).toBe(0);
    expect(expandedFold?.shownCount).toBe(28);
  });

  it("preserves an explicit expansion when selecting a revealed change", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );
    const collapsed = foldHistory(changes, undefined, new Set());
    const fold = collapsed.find((item) => item.kind === "fold");
    const revealedByGap = revealHistoryFold(changes, new Set(), fold!, HISTORY_REVEAL_STEP);

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

    const items = foldHistory(changes, "change-20", new Set());
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

    expect(foldHistory(changes, undefined, new Set(), false)).toHaveLength(30);
  });

  it("keeps temporary preview anchors visible without permanently expanding gaps", () => {
    const changes = Array.from({ length: 30 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );

    const items = foldHistory(
      changes,
      undefined,
      new Set(),
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


describe("history expansion navigation", () => {
  const changes = Array.from({ length: 200 }, (_, index) =>
    change(`change-${index}`, {
      workingCopy: index === 0,
      bookmarks: index === 1 ? [{ name: "main", remote: null }] : [],
    }),
  );
  const rows = (selected: number, revealed: ReadonlySet<string>) =>
    foldHistory(changes, `change-${selected}`, revealed);
  const ids = (items: ReturnType<typeof foldHistory>) =>
    items.filter((item) => item.kind === "change").map((item) => item.change.changeId);
  const folds = (items: ReturnType<typeof foldHistory>) =>
    items.filter((item) => item.kind === "fold");

  it("keeps all twenty explicit rows when navigating beyond the expansion and back", () => {
    const revealed = revealHistoryFold(changes, new Set(), folds(rows(0, new Set()))[0], 20);
    const before = ids(rows(22, revealed));
    for (const selected of [23, 24, 30, 60, 23, 22]) {
      const after = ids(rows(selected, revealed));
      expect(after).toEqual(expect.arrayContaining(before));
      expect(after).toContain(`change-${selected}`);
    }
  });

  it("keeps a lower expansion after clicking or navigating into it", () => {
    const upper = revealHistoryFold(changes, new Set(), folds(rows(0, new Set()))[0], 20);
    const lower = folds(rows(60, upper)).at(-1)!;
    const revealed = revealHistoryFold(changes, upper, lower, 10);
    const explicit = [...revealed];
    for (const selected of [63, 64, 71, 72, 90, 63, 0]) {
      expect(ids(rows(selected, revealed))).toEqual(expect.arrayContaining(explicit));
    }
    const items = rows(63, revealed);
    const indexes = items.filter((item) => item.kind === "change").map((item) => item.sourceIndex);
    expect(indexes).toEqual([...new Set(indexes)].sort((a, b) => a - b));
    expect(folds(items).some((fold) => fold.startIndex === 3 && fold.endIndex === 61)).toBe(true);
    expect(folds(items).map((fold) => fold.id).length).toBe(new Set(folds(items).map((fold) => fold.id)).size);
  });

  it("collapses only the chosen expansion and keeps the selected hidden row visible", () => {
    const upper = revealHistoryFold(changes, new Set(), folds(rows(0, new Set()))[0], 20);
    const lower = folds(rows(60, upper)).at(-1)!;
    const revealed = revealHistoryFold(changes, upper, lower, 10);
    const control = folds(rows(63, revealed)).at(-1)!;
    const collapsed = revealHistoryFold(changes, revealed, control, 0);
    expect([...collapsed]).toEqual([...upper]);
    expect(ids(rows(63, collapsed))).toEqual(expect.arrayContaining([...upper, "change-63"]));
    expect(ids(rows(63, collapsed))).not.toContain("change-70");
    const all = revealHistoryFold(changes, collapsed, folds(rows(0, collapsed))[0], 197);
    expect(ids(rows(150, all))).toHaveLength(200);
    const reset = revealHistoryFold(changes, all, folds(rows(0, all))[0], 0);
    expect(ids(rows(0, reset))).toEqual(["change-0", "change-1", "change-2"]);
  });
});


describe("history page append", () => {
  it("preserves explicit rows and their display positions when older rows arrive", () => {
    const pages = Array.from({ length: 400 }, (_, index) =>
      change(`change-${index}`, { workingCopy: index === 0 }),
    );
    const first = pages.slice(0, 200);
    const fold = foldHistory(first, "change-0", new Set()).find(item => item.kind === "fold")!;
    if (fold.kind !== "fold") throw new Error("fixture needs a folded interval");
    const revealed = revealHistoryFold(first, new Set(), fold, fold.totalCount);
    const before = foldHistory(first, "change-199", revealed);
    const after = foldHistory(pages, "change-199", revealed);
    const rowPositions = (items: ReturnType<typeof foldHistory>) => items.flatMap((item, index) =>
      item.kind === "change" && item.sourceIndex < 200 ? [{ id: item.change.changeId, index }] : []);
    expect(rowPositions(after)).toEqual(rowPositions(before));
    expect(after.some(item => item.kind === "fold" && item.hiddenCount > 0)).toBe(true);
  });
});


describe("scoped history expansion", () => {
  const changes = Array.from({ length: 80 }, (_, i) => change(`change-${i}`, {
    workingCopy: i === 0,
    bookmarks: i === 1 ? [{ name: "main", remote: null }] : [],
  }));
  const empty = (): HistoryExpansion => ({ revealedChangeIds: new Set(), contextAnchorChangeIds: new Set() });
  const rows = (selected: number, state: HistoryExpansion, data = changes) =>
    foldHistory(data, `change-${selected}`, state.revealedChangeIds, true, [...state.contextAnchorChangeIds]);
  const folds = (selected: number, state: HistoryExpansion, data = changes) =>
    rows(selected, state, data).filter(x => x.kind === "fold");

  it.each([0, 1])("expands only clicked group %i and retains its context boundary", side => {
    const split = folds(15, empty());
    expect(split.map(x => x.hiddenCount)).toEqual([11, 63]);
    const clicked = split[side];
    const all = updateHistoryExpansion(changes, empty(), clicked, clicked.totalCount, "change-15");
    expect([...all.revealedChangeIds]).toEqual(changes.slice(clicked.startIndex, clicked.endIndex + 1).map(x => x.changeId));
    const before = rows(15, all);
    for (const selection of side === 0 ? [14, 13, 12, 14, 15, 16] : [16, 17, 18, 16, 15, 14]) {
      expect(rows(selection, all)).toEqual(before);
      expect(folds(selection, all)[1-side]).toEqual(split[1-side]);
    }
    expect(folds(15, all)[side]).toMatchObject({ ...clicked, hiddenCount: 0, shownCount: clicked.totalCount });
  });

  it("keeps both groups independent through expand, navigation and scoped collapse", () => {
    const first = folds(15, empty())[0];
    const upper = updateHistoryExpansion(changes, empty(), first, first.totalCount, "change-15");
    const second = folds(15, upper)[1];
    const both = updateHistoryExpansion(changes, upper, second, second.totalCount, "change-15");
    const before = rows(15, both);
    for (let selection = 0; selection < changes.length; selection++) expect(rows(selection, both)).toEqual(before);
    const collapsed = updateHistoryExpansion(changes, both, folds(20, both)[1], 0, "change-20");
    expect([...collapsed.revealedChangeIds]).toEqual([...upper.revealedChangeIds]);
    expect(folds(15, collapsed)[0].shownCount).toBe(11);
    const reset = updateHistoryExpansion(changes, collapsed, folds(15, collapsed)[0], 0, "change-15");
    expect(reset.contextAnchorChangeIds.size).toBe(0);
    expect(rows(0, reset)).toEqual(rows(0, empty()));
  });

  it("retains an upper partial prefix that does not reach the selection boundary", () => {
    const upper = folds(30, empty())[0];
    const partial = updateHistoryExpansion(changes, empty(), upper, 10, "change-30");
    const before = rows(30, partial);
    expect(rows(10, partial)).toEqual(before);
    expect(folds(10, partial)[0]).toMatchObject({ shownCount: 10, hiddenCount: 16 });
    const all = updateHistoryExpansion(changes, partial, folds(10, partial)[0], upper.totalCount, "change-10");
    expect(folds(30, all)[1]).toEqual(folds(30, empty())[1]);
    const collapsed = updateHistoryExpansion(changes, all, folds(10, all)[0], 0, "change-10");
    expect(collapsed.contextAnchorChangeIds.size).toBe(0);
  });

  it("retains a partial lower expansion while preserving upper hidden rows", () => {
    const partial = updateHistoryExpansion(changes, empty(), folds(15, empty())[1], 10, "change-15");
    expect(partial.revealedChangeIds.size).toBe(10);
    expect(folds(18, partial)[0].hiddenCount).toBe(11);
    expect(folds(18, partial)[1]).toMatchObject({ shownCount: 10, hiddenCount: 53 });
    const more = updateHistoryExpansion(changes, partial, folds(18, partial)[1], 20, "change-18");
    expect(more.revealedChangeIds.size).toBe(20);
    expect(folds(18, more)[0].hiddenCount).toBe(11);
  });

  it("does not re-hide three contextual rows when returning across the old 295/296 boundary", () => {
    const data = Array.from({ length: 305 }, (_, i) => change(`change-${i}`, {
      workingCopy: i === 0, bookmarks: i === 302 ? [{ name: "end", remote: null }] : [],
    }));
    const upper = folds(299, empty(), data)[0];
    const all = updateHistoryExpansion(data, empty(), upper, upper.totalCount, "change-299");
    const before = rows(299, all, data);
    for (const selected of [297, 298, 299, 300, 301, 302, 298, 297]) expect(rows(selected, all, data)).toEqual(before);
    expect(folds(297, all, data)[0]).toMatchObject({ shownCount: 296, hiddenCount: 0 });
  });

  it("preserves scoped boundaries during page append and resets through an empty state", () => {
    const first = changes.slice(0, 40);
    const lower = folds(15, empty(), first)[1];
    const all = updateHistoryExpansion(first, empty(), lower, lower.totalCount, "change-15");
    const before = rows(18, all, first).filter(x => x.kind === "change");
    expect(rows(18, all).filter(x => x.kind === "change")).toEqual(before);
    expect(folds(18, all)[0].hiddenCount).toBe(11);
    expect(folds(18, all)[1]).toMatchObject({ shownCount: 23, hiddenCount: 40 });
    expect(rows(0, empty())).toHaveLength(4);
  });
});
