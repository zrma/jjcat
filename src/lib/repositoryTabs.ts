import type { RepositoryId } from "../types";

export type RepositoryTabDropEdge = "before" | "after";

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
