import { describe, expect, it } from "vitest";
import { groupBookmarksAtRevision, uniqueBookmarks } from "./bookmarks";

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

describe("groupBookmarksAtRevision", () => {
  it("collapses Git and network references aligned with a local bookmark", () => {
    expect(
      groupBookmarksAtRevision([
        { name: "master", remote: null },
        { name: "master", remote: "git" },
        { name: "master", remote: "origin" },
      ]),
    ).toEqual([
      {
        primary: { name: "master", remote: null },
        alignedRemotes: [
          { name: "master", remote: "git" },
          { name: "master", remote: "origin" },
        ],
      },
    ]);
  });

  it("keeps a remote bookmark separate when no local bookmark shares the revision", () => {
    expect(groupBookmarksAtRevision([{ name: "master", remote: "origin" }])).toEqual([
      {
        primary: { name: "master", remote: "origin" },
        alignedRemotes: [],
      },
    ]);
  });

  it("only aligns remotes with the matching local bookmark name", () => {
    expect(
      groupBookmarksAtRevision([
        { name: "main", remote: null },
        { name: "release", remote: "origin" },
      ]),
    ).toEqual([
      { primary: { name: "main", remote: null }, alignedRemotes: [] },
      { primary: { name: "release", remote: "origin" }, alignedRemotes: [] },
    ]);
  });
});
