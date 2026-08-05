import { describe, expect, it } from "vitest";
import { buildRevisionTree, sortedRevisionChildren } from "./revisionTree";

describe("revision tree", () => {
  it("builds deterministic directory-first nodes with file metadata", () => {
    const root = buildRevisionTree([
      { path: "README.md", fileType: "file", conflict: false, executable: false, status: null },
      { path: "src/z.ts", fileType: "file", conflict: false, executable: false, status: "M" },
      { path: "src/a.ts", fileType: "file", conflict: true, executable: false, status: "A" },
    ]);

    expect(sortedRevisionChildren(root).map((node) => node.name)).toEqual(["src", "README.md"]);
    expect(root.children.get("src")?.children.get("a.ts")?.entry?.conflict).toBe(true);
    expect(root.children.get("src")?.children.get("z.ts")?.entry?.status).toBe("M");
  });
});
