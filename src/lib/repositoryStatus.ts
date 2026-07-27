import { isStale } from "./format";
import type { CachedProjection, RepositoryLocation } from "../types";

export type RepositoryState =
  | "ready"
  | "cached"
  | "stale"
  | "refreshing"
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
  errors: Record<string, string>,
): RepositoryState {
  if (refreshing[repositoryId]) return "refreshing";
  if (errors[repositoryId]) {
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
