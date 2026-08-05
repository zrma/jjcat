import { describe, expect, it, vi } from "vitest";
import {
  buildFileTimelineScale,
  createFileTimelineProjectionCache,
  fileTimelinePresentation,
  fileTimelineUrl,
  groupAnnotationLines,
  mergeFileHistory,
  neighboringFileRevisions,
  parseFileTimelineRequest,
} from "./fileTimeline";
import type {
  FileAnnotationLine,
  FileHistoryEntry,
  FileTimelineProjection,
} from "../types";

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

function projection(entry: FileHistoryEntry): FileTimelineProjection {
  return {
    repositoryId: "repo-fixture",
    changeId: entry.changeId,
    commitId: entry.commitId,
    path: "src/file.ts",
    history: [entry],
    lines: [],
    binary: false,
    truncated: false,
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

  it("keeps an existing projection visible while a revision refresh is pending or fails", () => {
    expect(fileTimelinePresentation(false, true, false)).toBe("initial-loading");
    expect(fileTimelinePresentation(false, false, true)).toBe("initial-error");
    expect(fileTimelinePresentation(true, true, false)).toBe("refreshing");
    expect(fileTimelinePresentation(true, false, true)).toBe("stale-error");
    expect(fileTimelinePresentation(true, false, false)).toBe("ready");
  });

  it("selects only the immediate older and newer revisions for background prefetch", () => {
    const newest = historyEntry("a".repeat(40), "2026-08-05T00:00:00Z");
    const current = historyEntry("b".repeat(40), "2026-08-04T00:00:00Z");
    const older = historyEntry("c".repeat(40), "2026-08-03T00:00:00Z");
    const oldest = historyEntry("d".repeat(40), "2026-08-02T00:00:00Z");

    expect(neighboringFileRevisions([newest, current, older, oldest], current.commitId)).toEqual([
      older,
      newest,
    ]);
    expect(neighboringFileRevisions([newest, current, older, oldest], newest.commitId)).toEqual([
      current,
    ]);
  });

  it("deduplicates in-flight projection loads and reuses the resolved projection", async () => {
    const entry = historyEntry("a".repeat(40), "2026-08-05T00:00:00Z");
    let resolveLoad!: (value: FileTimelineProjection) => void;
    const loader = vi.fn(
      () => new Promise<FileTimelineProjection>((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const cache = createFileTimelineProjectionCache(loader);
    const revision = { changeId: entry.changeId, commitId: entry.commitId };

    const first = cache.load(revision);
    const duplicate = cache.load(revision);
    expect(first).toBe(duplicate);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoad(projection(entry));
    await expect(first).resolves.toMatchObject({ commitId: entry.commitId });
    await expect(cache.load(revision)).resolves.toMatchObject({ commitId: entry.commitId });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used projection from the bounded window cache", async () => {
    const entries = [
      historyEntry("a".repeat(40), "2026-08-05T00:00:00Z"),
      historyEntry("b".repeat(40), "2026-08-04T00:00:00Z"),
      historyEntry("c".repeat(40), "2026-08-03T00:00:00Z"),
    ];
    const loader = vi.fn(async (revision: { changeId: string; commitId: string }) =>
      projection(entries.find((entry) => entry.commitId === revision.commitId)!),
    );
    const cache = createFileTimelineProjectionCache(loader, 2);

    await cache.load(entries[0]);
    await cache.load(entries[1]);
    expect(cache.get(entries[0].commitId)).toBeDefined();
    await cache.load(entries[2]);

    expect(cache.get(entries[0].commitId)).toBeDefined();
    expect(cache.get(entries[1].commitId)).toBeUndefined();
    expect(cache.get(entries[2].commitId)).toBeDefined();
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
