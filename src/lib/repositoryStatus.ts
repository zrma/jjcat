import { isStale } from "./format";
import type { AppError, CachedProjection, RepositoryLocation } from "../types";

export type RepositoryState =
  | "ready"
  | "cached"
  | "stale"
  | "refreshing"
  | "waiting"
  | "waiting-cached"
  | "failed"
  | "failed-cached"
  | "disconnected"
  | "disconnected-cached"
  | "empty";

export function repositoryState(
  repositoryId: string,
  locationKind: RepositoryLocation["kind"],
  cache: CachedProjection | undefined,
  freshIds: Set<string>,
  refreshing: Record<string, string>,
  errors: Record<string, AppError>,
): RepositoryState {
  if (refreshing[repositoryId]) return "refreshing";
  const error = errors[repositoryId];
  if (error?.kind === "busy") return cache ? "waiting-cached" : "waiting";
  if (error) {
    if (locationKind === "ssh") {
      return cache ? "disconnected-cached" : "disconnected";
    }
    return cache ? "failed-cached" : "failed";
  }
  if (!cache) return "empty";
  if (freshIds.has(repositoryId)) return "ready";
  return isStale(cache.cachedAt) ? "stale" : "cached";
}

export function stateLabel(state: RepositoryState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "refreshing":
      return "Refreshing";
    case "waiting":
    case "waiting-cached":
      return "Waiting to refresh";
    case "failed":
      return "Refresh failed";
    case "failed-cached":
      return "Refresh failed · Cached";
    case "disconnected":
      return "Disconnected";
    case "disconnected-cached":
      return "Disconnected · Cached";
    case "stale":
      return "Cached · Stale";
    case "cached":
      return "Cached";
    case "empty":
      return "Never refreshed";
  }
}

export function compactStateLabel(state: RepositoryState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "refreshing":
      return "Syncing";
    case "waiting":
    case "waiting-cached":
      return "Waiting";
    case "failed":
    case "failed-cached":
      return "Refresh failed";
    case "disconnected":
      return "Disconnected";
    case "disconnected-cached":
      return "Disconnected · Cached";
    case "stale":
      return "Stale";
    case "cached":
      return "Cached";
    case "empty":
      return "New";
  }
}

export function isDisconnectedState(state: RepositoryState) {
  return state === "disconnected" || state === "disconnected-cached";
}
