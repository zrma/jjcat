import { describe, expect, it } from "vitest";
import { uniqueBookmarks } from "./bookmarks";

describe("uniqueBookmarks", () => {
  it("preserves bookmark order while removing duplicate labels", () => {
    expect(uniqueBookmarks([
      { name: "main", remote: null },
      { name: "main", remote: "origin" },
      { name: "main", remote: null },
    ])).toEqual([
      { name: "main", remote: null },
      { name: "main", remote: "origin" },
    ]);
  });
});
