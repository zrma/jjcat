import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import { filterChanges, type HistoryView } from "./changeFilters";

const changes: ChangeRow[] = [
  {
    changeId: "working",
    commitId: "111111111111",
    summary: "edit working copy",
    description:
      "edit working copy\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>",
    author: "Alice",
    authorEmail: "alice@example.invalid",
    committer: "Integration Bot",
    committerEmail: "integration@example.invalid",
    updatedAt: "2026-01-01T00:00:00Z",
    parents: ["local"],
    bookmarks: [],
    workingCopy: true,
    conflict: false,
    empty: false,
    files: [],
  },
  {
    changeId: "local",
    commitId: "222222222222",
    summary: "publish local bookmark",
    author: "Bob",
    updatedAt: "2026-01-01T00:00:00Z",
    parents: ["remote"],
    bookmarks: [{ name: "main", remote: null }],
    workingCopy: false,
    conflict: false,
    empty: false,
    files: [],
  },
  {
    changeId: "remote",
    commitId: "333333333333",
    summary: "track network state",
    author: "Carol",
    updatedAt: "2026-01-01T00:00:00Z",
    parents: [],
    bookmarks: [{ name: "main", remote: "origin" }],
    workingCopy: false,
    conflict: true,
    empty: false,
    files: [],
  },
];

describe("change history filters", () => {
  it.each<[HistoryView, string[]]>([
    ["all", ["working", "local", "remote"]],
    ["working-copy", ["working"]],
    ["bookmarks", ["local"]],
    ["remote-bookmarks", ["remote"]],
    ["conflicts", ["remote"]],
  ])("filters the %s repository view", (view, expected) => {
    expect(filterChanges(changes, view, "").map((change) => change.changeId)).toEqual(expected);
  });

  it("applies text search within the selected repository view", () => {
    expect(
      filterChanges(changes, "remote-bookmarks", "origin").map((change) => change.changeId),
    ).toEqual(["remote"]);
    expect(filterChanges(changes, "bookmarks", "carol")).toEqual([]);
    expect(filterChanges(changes, "all", "fixture bot")).toEqual([changes[0]]);
    expect(filterChanges(changes, "all", "integration@example.invalid")).toEqual([
      changes[0],
    ]);
  });
});
