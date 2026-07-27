import { describe, expect, it } from "vitest";
import {
  adjacentRepositoryTabId,
  reorderRepositoryTabs,
  repositoryTabCycleDirection,
} from "./repositoryTabs";

function shortcut(
  key: string,
  modifiers: Partial<
    Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
  > = {},
) {
  return repositoryTabCycleDirection({
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  });
}

describe("repository tab cycling", () => {
  it("recognizes forward and backward Ctrl+Tab shortcuts", () => {
    expect(shortcut("Tab", { ctrlKey: true })).toBe(1);
    expect(shortcut("Tab", { ctrlKey: true, shiftKey: true })).toBe(-1);
  });

  it("does not claim unrelated or platform command shortcuts", () => {
    expect(shortcut("Tab")).toBeNull();
    expect(shortcut("Tab", { metaKey: true })).toBeNull();
    expect(shortcut("Tab", { ctrlKey: true, altKey: true })).toBeNull();
    expect(shortcut("ArrowRight", { ctrlKey: true })).toBeNull();
  });

  it("cycles through the persisted tab order and wraps at both ends", () => {
    const repositoryIds = ["a", "b", "c"];

    expect(adjacentRepositoryTabId(repositoryIds, "a", 1)).toBe("b");
    expect(adjacentRepositoryTabId(repositoryIds, "c", 1)).toBe("a");
    expect(adjacentRepositoryTabId(repositoryIds, "c", -1)).toBe("b");
    expect(adjacentRepositoryTabId(repositoryIds, "a", -1)).toBe("c");
  });

  it("selects the nearest edge for a missing selection and ignores single tabs", () => {
    expect(adjacentRepositoryTabId(["a", "b"], "missing", 1)).toBe("a");
    expect(adjacentRepositoryTabId(["a", "b"], null, -1)).toBe("b");
    expect(adjacentRepositoryTabId(["a"], "a", 1)).toBeNull();
    expect(adjacentRepositoryTabId([], null, -1)).toBeNull();
  });
});

describe("repository tab ordering", () => {
  it("moves a tab before the drop target", () => {
    expect(reorderRepositoryTabs(["a", "b", "c"], "c", "a", "before")).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("moves a tab after the drop target", () => {
    expect(reorderRepositoryTabs(["a", "b", "c"], "a", "b", "after")).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("preserves the existing reference when the requested position is unchanged", () => {
    const repositoryIds = ["a", "b", "c"];

    expect(reorderRepositoryTabs(repositoryIds, "a", "b", "before")).toBe(repositoryIds);
    expect(reorderRepositoryTabs(repositoryIds, "b", "b", "after")).toBe(repositoryIds);
  });

  it("ignores unknown repository ids without losing tabs", () => {
    const repositoryIds = ["a", "b", "c"];

    expect(reorderRepositoryTabs(repositoryIds, "missing", "b", "before")).toBe(
      repositoryIds,
    );
    expect(reorderRepositoryTabs(repositoryIds, "a", "missing", "after")).toBe(
      repositoryIds,
    );
  });
});
