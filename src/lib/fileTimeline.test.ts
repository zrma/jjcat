import { describe, expect, it } from "vitest";
import {
  fileTimelineUrl,
  groupAnnotationLines,
  mergeFileHistory,
  parseFileTimelineRequest,
} from "./fileTimeline";
import type { FileAnnotationLine } from "../types";

const request = {
  repositoryId: "repo-fixture",
  repositoryName: "fixture",
  changeId: "abcdefghijkl",
  commitId: "0123456789abcdef",
  path: "src/file with spaces.ts",
};

function line(
  lineNumber: number,
  commitId: string,
  firstLineInHunk: boolean,
): FileAnnotationLine {
  return {
    lineNumber,
    originalLineNumber: lineNumber,
    firstLineInHunk,
    changeId: commitId.slice(0, 12),
    commitId,
    summary: `change ${commitId}`,
    author: "Fixture",
    timestamp: "2026-01-01T00:00:00Z",
    content: `line ${lineNumber}\n`,
  };
}

describe("file timeline window", () => {
  it("round trips an exact repository path through the window URL", () => {
    const url = new URL(fileTimelineUrl(request), "https://fixture.invalid/");
    expect(parseFileTimelineRequest(url.search)).toEqual(request);
  });

  it("rejects partial timeline requests", () => {
    expect(parseFileTimelineRequest("?window=file-timeline&repositoryId=repo")).toBeNull();
  });

  it("groups adjacent provenance while respecting explicit hunk boundaries", () => {
    const groups = groupAnnotationLines([
      line(1, "aaaaaaaaaaaaaaaa", true),
      line(2, "aaaaaaaaaaaaaaaa", false),
      line(3, "bbbbbbbbbbbbbbbb", true),
      line(4, "aaaaaaaaaaaaaaaa", true),
    ]);

    expect(groups.map((group) => group.lines.map((item) => item.lineNumber))).toEqual([
      [1, 2],
      [3],
      [4],
    ]);
  });

  it("retains newer revisions when an older projection is loaded", () => {
    const newest = {
      changeId: "aaaaaaaaaaaa",
      commitId: "a".repeat(40),
      summary: "newest",
      author: "Avery",
      timestamp: "2026-08-05T00:00:00Z",
    };
    const older = {
      changeId: "bbbbbbbbbbbb",
      commitId: "b".repeat(40),
      summary: "older",
      author: "Jordan",
      timestamp: "2026-08-01T00:00:00Z",
    };

    expect(mergeFileHistory([newest, older], [older])).toEqual([newest, older]);
  });
});
