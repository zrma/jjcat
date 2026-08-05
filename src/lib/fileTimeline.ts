import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauriRuntime } from "../bridge";
import type { FileAnnotationLine, FileHistoryEntry } from "../types";

export const FILE_TIMELINE_WINDOW_LABEL = "file-timeline";
export const FILE_TIMELINE_WINDOW_OPTIONS = {
  width: 1440,
  height: 920,
  minWidth: 820,
  minHeight: 520,
  center: true,
  decorations: true,
  resizable: true,
  maximizable: true,
  minimizable: true,
  closable: true,
  focus: true,
} as const;

export interface FileTimelineRequest {
  repositoryId: string;
  repositoryName: string;
  changeId: string;
  commitId: string;
  path: string;
}

export interface AnnotationGroup {
  commitId: string;
  changeId: string;
  summary: string;
  author: string;
  timestamp: string;
  lines: FileAnnotationLine[];
}

export interface FileTimelineTick {
  key: string;
  label: string;
  position: number;
  major: boolean;
}

export interface FileTimelineYear {
  year: number;
  position: number;
}

export interface FileTimelineCluster {
  id: string;
  position: number;
  entries: FileHistoryEntry[];
}

export interface FileTimelinePoint {
  entry: FileHistoryEntry;
  position: number;
}

export interface FileTimelineScale {
  start: number;
  end: number;
  ticks: FileTimelineTick[];
  years: FileTimelineYear[];
  points: FileTimelinePoint[];
  clusters: FileTimelineCluster[];
}

function timestamp(entry: FileHistoryEntry) {
  const parsed = Date.parse(entry.timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthStart(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextMonth(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function timelinePosition(value: number, start: number, end: number) {
  return ((value - start) / Math.max(1, end - start)) * 100;
}

export function buildFileTimelineScale(
  history: FileHistoryEntry[],
  width: number,
  markerSpacing = 18,
): FileTimelineScale | null {
  const chronological = history
    .map((entry) => ({ entry, timestamp: timestamp(entry) }))
    .filter((item): item is { entry: FileHistoryEntry; timestamp: number } =>
      item.timestamp !== null,
    )
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp ||
        left.entry.commitId.localeCompare(right.entry.commitId),
    );
  if (chronological.length === 0) return null;

  const start = monthStart(chronological[0].timestamp);
  const end = nextMonth(monthStart(chronological.at(-1)!.timestamp));
  const ticks: FileTimelineTick[] = [];
  for (let cursor = start; cursor <= end; cursor = nextMonth(cursor)) {
    const date = new Date(cursor);
    ticks.push({
      key: `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`,
      label: String(date.getUTCMonth() + 1),
      position: timelinePosition(cursor, start, end),
      major: date.getUTCMonth() === 0,
    });
  }

  const years: FileTimelineYear[] = [];
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  for (let year = startYear; year <= endYear; year += 1) {
    const segmentStart = Math.max(start, Date.UTC(year, 0, 1));
    const segmentEnd = Math.min(end, Date.UTC(year + 1, 0, 1));
    if (segmentEnd <= segmentStart) continue;
    years.push({
      year,
      position: timelinePosition((segmentStart + segmentEnd) / 2, start, end),
    });
  }

  const points = chronological.map((item) => ({
    entry: item.entry,
    position: timelinePosition(item.timestamp, start, end),
  }));
  const safeWidth = Math.max(1, width);
  const buckets = new Map<number, FileTimelinePoint[]>();
  for (const point of points) {
    const x = (point.position / 100) * safeWidth;
    const bucket = Math.round(x / Math.max(1, markerSpacing));
    const entries = buckets.get(bucket) ?? [];
    entries.push(point);
    buckets.set(bucket, entries);
  }

  const clusters = [...buckets.entries()].map(([bucket, items]) => ({
    id: `${bucket}:${items.map((item) => item.entry.commitId).join(":")}`,
    position: items.reduce((sum, item) => sum + item.position, 0) / items.length,
    entries: items
      .map((item) => item.entry)
      .sort((left, right) => (timestamp(right) ?? 0) - (timestamp(left) ?? 0)),
  }));

  return { start, end, ticks, years, points, clusters };
}

let browserTimelineWindow: Window | null = null;

export function fileTimelineUrl(request: FileTimelineRequest) {
  const params = new URLSearchParams({
    window: FILE_TIMELINE_WINDOW_LABEL,
    repositoryId: request.repositoryId,
    repositoryName: request.repositoryName,
    changeId: request.changeId,
    commitId: request.commitId,
    path: request.path,
  });
  return `index.html?${params.toString()}`;
}

export function parseFileTimelineRequest(search: string): FileTimelineRequest | null {
  const params = new URLSearchParams(search);
  if (params.get("window") !== FILE_TIMELINE_WINDOW_LABEL) return null;
  const repositoryId = params.get("repositoryId");
  const repositoryName = params.get("repositoryName");
  const changeId = params.get("changeId");
  const commitId = params.get("commitId");
  const path = params.get("path");
  if (!repositoryId || !repositoryName || !changeId || !commitId || !path) {
    return null;
  }
  return { repositoryId, repositoryName, changeId, commitId, path };
}

export function groupAnnotationLines(lines: FileAnnotationLine[]) {
  const groups: AnnotationGroup[] = [];
  for (const line of lines) {
    const previous = groups.at(-1);
    if (
      previous &&
      previous.commitId === line.commitId &&
      !line.firstLineInHunk
    ) {
      previous.lines.push(line);
      continue;
    }
    groups.push({
      commitId: line.commitId,
      changeId: line.changeId,
      summary: line.summary,
      author: line.author,
      timestamp: line.timestamp,
      lines: [line],
    });
  }
  return groups;
}

export function mergeFileHistory(
  current: FileHistoryEntry[],
  incoming: FileHistoryEntry[],
) {
  const byCommit = new Map(
    [...current, ...incoming].map((entry) => [entry.commitId, entry]),
  );
  return [...byCommit.values()].sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  );
}

export async function openFileTimelineWindow(request: FileTimelineRequest) {
  if (!isTauriRuntime) {
    const url = new URL(fileTimelineUrl(request), window.location.href);
    if (browserTimelineWindow && !browserTimelineWindow.closed) {
      browserTimelineWindow.location.replace(url);
      browserTimelineWindow.focus();
      return;
    }
    browserTimelineWindow = window.open(
      url,
      FILE_TIMELINE_WINDOW_LABEL,
      "popup,width=1440,height=920,resizable=yes,scrollbars=no",
    );
    return;
  }

  const existing = await WebviewWindow.getByLabel(FILE_TIMELINE_WINDOW_LABEL);
  if (existing) await existing.close();
  const timelineWindow = new WebviewWindow(FILE_TIMELINE_WINDOW_LABEL, {
    url: fileTimelineUrl(request),
    title: `Blame · ${request.path} — ${request.repositoryName}`,
    ...FILE_TIMELINE_WINDOW_OPTIONS,
  });
  await new Promise<void>((resolve, reject) => {
    void timelineWindow.once("tauri://created", () => resolve());
    void timelineWindow.once<unknown>("tauri://error", (event) =>
      reject(new Error(String(event.payload))),
    );
  });
  await timelineWindow.show();
  await timelineWindow.setFocus();
}
