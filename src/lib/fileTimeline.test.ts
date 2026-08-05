import { describe, expect, it } from "vitest";
import {
  buildFileTimelineScale,
  fileTimelineUrl,
  groupAnnotationLines,
  mergeFileHistory,
  parseFileTimelineRequest,
} from "./fileTimeline";
import type { FileAnnotationLine, FileHistoryEntry } from "../types";

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

function historyEntry(
  commitId: string,
  timestamp: string,
): FileHistoryEntry {
  return {
    changeId: commitId.slice(0, 12),
    commitId,
    summary: `change ${commitId}`,
    author: "Fixture",
    timestamp,
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

  it("builds calendar ticks and positions commits by elapsed time", () => {
    const scale = buildFileTimelineScale(
      [
        historyEntry("a".repeat(40), "2023-11-20T00:00:00Z"),
        historyEntry("b".repeat(40), "2024-11-20T00:00:00Z"),
        historyEntry("c".repeat(40), "2026-02-04T00:00:00Z"),
      ],
      1200,
    );

    expect(scale?.ticks[0]).toMatchObject({ key: "2023-11", label: "11" });
    expect(scale?.ticks.some((tick) => tick.key === "2024-1" && tick.major)).toBe(true);
    expect(scale?.years.map((year) => year.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(scale?.clusters).toHaveLength(3);
    expect(scale!.clusters[1].position).toBeGreaterThan(scale!.clusters[0].position);
    expect(scale!.clusters[2].position).toBeGreaterThan(scale!.clusters[1].position);
  });

  it("clusters nearby commits according to the rendered ruler width", () => {
    const scale = buildFileTimelineScale(
      [
        historyEntry("a".repeat(40), "2026-08-01T00:00:00Z"),
        historyEntry("b".repeat(40), "2026-08-01T03:00:00Z"),
        historyEntry("c".repeat(40), "2026-08-25T00:00:00Z"),
      ],
      640,
    );

    expect(scale?.clusters).toHaveLength(2);
    expect(scale?.clusters[0].entries.map((entry) => entry.commitId)).toEqual([
      "b".repeat(40),
      "a".repeat(40),
    ]);
  });
});
