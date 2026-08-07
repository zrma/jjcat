import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import {
  changedDagLanesInRange,
  dagColumnWidth,
  dagLaneX,
  dagRowLayoutEquals,
  layoutDag,
} from "./dag";

function row(changeId: string, parents: string[]): ChangeRow {
  return {
    changeId,
    commitId: changeId,
    summary: changeId,
    author: "fixture",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks: [],
    tags: [],
    parents,
    files: [],
    conflict: false,
    workingCopy: false,
    empty: false,
  };
}

describe("DAG geometry", () => {
  it("centers a single lane and keeps equal side insets for multiple lanes", () => {
    expect(dagColumnWidth(1)).toBe(32);
    expect(dagLaneX(0)).toBe(16);

    expect(dagColumnWidth(2)).toBe(44);
    expect(dagLaneX(1)).toBe(28);
    expect(dagLaneX(0)).toBe(dagColumnWidth(2) - dagLaneX(1));
  });

  it("bounds geometry to the maximum visible lane count", () => {
    expect(dagLaneX(99)).toBe(dagLaneX(9));
    expect(dagColumnWidth(99)).toBe(dagColumnWidth(10));
  });
});

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
      {
        fromLane: 0,
        toLane: 0,
        kind: "parent",
        changeId: "left",
        parentIndex: 0,
      },
      {
        fromLane: 0,
        toLane: 1,
        kind: "parent",
        changeId: "base",
        parentIndex: 1,
      },
    ]);
    expect(first.rows[1].edges).toContainEqual({
      fromLane: 1,
      toLane: 0,
      kind: "continuation",
      changeId: "base",
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
      changeId: "base-a",
    });
  });

  it("compares complete row topology for current and proposed layering", () => {
    const layout = layoutDag([row("c", ["b"]), row("b", ["a"]), row("a", [])]);

    expect(dagRowLayoutEquals(layout.rows[0], layout.rows[0])).toBe(true);
    expect(
      dagRowLayoutEquals(layout.rows[0], {
        ...layout.rows[0],
        edges: layout.rows[0].edges.map((edge) => ({
          ...edge,
          changeId: "new-parent",
        })),
      }),
    ).toBe(false);
  });

  it("projects changed proposed lanes through a collapsed row range", () => {
    const current = layoutDag([
      row("head", ["source"]),
      row("source", ["old-parent"]),
      row("destination", ["root"]),
      row("old-parent", ["root"]),
      row("root", []),
    ]).rows;
    const proposed = layoutDag([
      row("head", ["source"]),
      row("source", ["destination"]),
      row("destination", ["root"]),
      row("old-parent", ["root"]),
      row("root", []),
    ]).rows;

    expect(changedDagLanesInRange(current, proposed, 1, 4)).toEqual([0, 1]);
    expect(changedDagLanesInRange(current, proposed, 4, 5)).toEqual([]);
  });
});
