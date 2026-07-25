import { describe, expect, it } from "vitest";
import { reorderRepositoryTabs } from "./repositoryTabs";

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
