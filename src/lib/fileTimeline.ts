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
