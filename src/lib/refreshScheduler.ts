import type { CachedProjection, RepositoryId } from "../types";

const ACTIVE_INTERVAL_MS = 30_000;
const INACTIVE_INTERVAL_MS = 120_000;
const FAILURE_BASE_MS = 15_000;
const MAX_BACKOFF_MS = 300_000;
const MIN_DELAY_MS = 1_000;

export function failureBackoffMs(failureCount: number) {
  if (failureCount <= 0) return 0;
  return Math.min(FAILURE_BASE_MS * 2 ** (failureCount - 1), MAX_BACKOFF_MS);
}

export function nextRefreshDelayMs({
  active,
  failureCount,
  cachedAt,
  now,
}: {
  active: boolean;
  failureCount: number;
  cachedAt?: string;
  now: number;
}) {
  const backoff = failureBackoffMs(failureCount);
  if (backoff) return backoff;
  if (!cachedAt) return MIN_DELAY_MS;
  const interval = active ? ACTIVE_INTERVAL_MS : INACTIVE_INTERVAL_MS;
  const cachedTime = Date.parse(cachedAt);
  if (!Number.isFinite(cachedTime)) return MIN_DELAY_MS;
  return Math.max(MIN_DELAY_MS, interval - Math.max(0, now - cachedTime));
}

export function planRepositoryRefreshes(
  openRepositoryIds: RepositoryId[],
  selectedRepository: RepositoryId | null,
  cachedProjections: Record<RepositoryId, CachedProjection>,
  failureCounts: Record<RepositoryId, number>,
  now: number,
) {
  return [...new Set(openRepositoryIds)].map((repositoryId) => ({
    repositoryId,
    delayMs: nextRefreshDelayMs({
      active: repositoryId === selectedRepository,
      failureCount: failureCounts[repositoryId] ?? 0,
      cachedAt: cachedProjections[repositoryId]?.cachedAt,
      now,
    }),
  }));
}
