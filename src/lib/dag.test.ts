import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import { layoutDag } from "./dag";

function row(changeId: string, parents: string[]): ChangeRow {
  return {
    changeId,
    commitId: changeId,
    summary: changeId,
    author: "fixture",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks: [],
    parents,
    files: [],
    conflict: false,
    workingCopy: false,
    empty: false,
  };
}

describe("layoutDag", () => {
  it("keeps a linear history in one stable lane", () => {
    const layout = layoutDag([row("c", ["b"]), row("b", ["a"]), row("a", [])]);

    expect(layout.maxLaneCount).toBe(1);
    expect(layout.rows.map(({ lane }) => lane)).toEqual([0, 0, 0]);
    expect(layout.rows.map(({ hasIncoming }) => hasIncoming)).toEqual([false, true, true]);
  });

  it("fans out merge parents and converges their lanes deterministically", () => {
    const changes = [
      row("merge", ["left", "base"]),
      row("left", ["base"]),
      row("base", ["root"]),
      row("root", []),
    ];
    const first = layoutDag(changes);
    const second = layoutDag(changes);

    expect(first).toEqual(second);
    expect(first.maxLaneCount).toBe(2);
    expect(first.rows[0].edges).toEqual([
      { fromLane: 0, toLane: 0, kind: "parent", parentIndex: 0 },
      { fromLane: 0, toLane: 1, kind: "parent", parentIndex: 1 },
    ]);
    expect(first.rows[1].edges).toContainEqual({
      fromLane: 1,
      toLane: 0,
      kind: "continuation",
    });
  });

  it("assigns unrelated heads separate lanes without losing active ancestry", () => {
    const layout = layoutDag([
      row("head-a", ["base-a"]),
      row("head-b", ["base-b"]),
      row("base-a", []),
      row("base-b", []),
    ]);

    expect(layout.maxLaneCount).toBe(2);
    expect(layout.rows[1].lane).toBe(1);
    expect(layout.rows[1].edges).toContainEqual({
      fromLane: 0,
      toLane: 0,
      kind: "continuation",
    });
  });
});
