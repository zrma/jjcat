import type { RepositoryId } from "../types";

export type RepositoryTabDropEdge = "before" | "after";
export type RepositoryTabCycleDirection = -1 | 1;

export function repositoryTabCycleDirection(
  event: Pick<
    KeyboardEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
  >,
): RepositoryTabCycleDirection | null {
  if (
    event.key !== "Tab" ||
    !event.ctrlKey ||
    event.metaKey ||
    event.altKey
  ) {
    return null;
  }

  return event.shiftKey ? -1 : 1;
}

export function adjacentRepositoryTabId(
  repositoryIds: RepositoryId[],
  selectedRepositoryId: RepositoryId | null,
  direction: RepositoryTabCycleDirection,
): RepositoryId | null {
  if (repositoryIds.length < 2) return null;

  const selectedIndex = selectedRepositoryId
    ? repositoryIds.indexOf(selectedRepositoryId)
    : -1;
  if (selectedIndex < 0) {
    return direction > 0
      ? repositoryIds[0] ?? null
      : repositoryIds.at(-1) ?? null;
  }

  const nextIndex =
    (selectedIndex + direction + repositoryIds.length) %
    repositoryIds.length;
  return repositoryIds[nextIndex] ?? null;
}

export function reorderRepositoryTabs(
  repositoryIds: RepositoryId[],
  sourceId: RepositoryId,
  targetId: RepositoryId,
  edge: RepositoryTabDropEdge,
): RepositoryId[] {
  if (
    sourceId === targetId ||
    !repositoryIds.includes(sourceId) ||
    !repositoryIds.includes(targetId)
  ) {
    return repositoryIds;
  }

  const reordered = repositoryIds.filter((repositoryId) => repositoryId !== sourceId);
  const targetIndex = reordered.indexOf(targetId);
  const insertionIndex = targetIndex + (edge === "after" ? 1 : 0);
  reordered.splice(insertionIndex, 0, sourceId);

  return reordered.every((repositoryId, index) => repositoryId === repositoryIds[index])
    ? repositoryIds
    : reordered;
}
