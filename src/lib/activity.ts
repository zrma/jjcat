export type ActivityCategory = "user" | "background";
export type ActivityState = "running" | "success" | "failed" | "cancelled";

export interface ActivityEntry {
  id: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  detail: string;
  category: ActivityCategory;
  state: ActivityState;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  cancellable: boolean;
  requestId: string | null;
}

export const ACTIVITY_HISTORY_LIMIT = 100;

export function appendActivity(
  entries: ActivityEntry[],
  entry: ActivityEntry,
  limit = ACTIVITY_HISTORY_LIMIT,
) {
  return [entry, ...entries].slice(0, limit);
}

export function finishActivity(
  entries: ActivityEntry[],
  id: string,
  state: Exclude<ActivityState, "running">,
  outcome: string,
  finishedAt: string,
) {
  return entries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          state,
          outcome,
          finishedAt,
          cancellable: false,
        }
      : entry,
  );
}

export function preferredActivity(
  entries: ActivityEntry[],
  selectedRepositoryId: string | null,
) {
  return (
    entries.find(
      (entry) =>
        entry.state === "running" &&
        entry.repositoryId === selectedRepositoryId,
    ) ??
    entries.find(
      (entry) => entry.state === "running" && entry.category === "user",
    ) ??
    entries.find((entry) => entry.state === "running") ??
    entries.find(
      (entry) =>
        entry.repositoryId === selectedRepositoryId &&
        entry.category === "user",
    ) ??
    entries.find(
      (entry) => entry.repositoryId === selectedRepositoryId,
    ) ??
    entries.find((entry) => entry.category === "user") ??
    entries[0] ??
    null
  );
}

export function activityDurationMs(
  entry: Pick<ActivityEntry, "startedAt" | "finishedAt">,
  now = Date.now(),
) {
  const startedAt = Date.parse(entry.startedAt);
  const finishedAt = entry.finishedAt ? Date.parse(entry.finishedAt) : now;
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return 0;
  return Math.max(0, finishedAt - startedAt);
}
