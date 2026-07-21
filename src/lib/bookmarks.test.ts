import { describe, expect, it } from "vitest";
import { uniqueBookmarks } from "./bookmarks";

describe("uniqueBookmarks", () => {
  it("preserves bookmark order while removing duplicate labels", () => {
    expect(uniqueBookmarks(["main", "release", "main", "review"])).toEqual([
      "main",
      "release",
      "review",
    ]);
  });
});
