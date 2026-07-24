import type { ChangeRow } from "../types";

export interface RebaseTopologyPreview {
  changes: ChangeRow[];
  source: ChangeRow;
  destination: ChangeRow;
}

function changeByCommitId(changes: ChangeRow[], commitId: string) {
  return changes.find((change) => change.commitId === commitId);
}

function hasAncestor(
  changesById: Map<string, ChangeRow>,
  changeId: string,
  ancestorId: string,
) {
  const pending = [...(changesById.get(changeId)?.parents ?? [])];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate || visited.has(candidate)) continue;
    if (candidate === ancestorId) return true;
    visited.add(candidate);
    pending.push(...(changesById.get(candidate)?.parents ?? []));
  }

  return false;
}

export function canPreviewRebase(
  changes: ChangeRow[],
  sourceCommitId: string,
  destinationCommitId: string,
) {
  if (sourceCommitId === destinationCommitId || /^0+$/.test(sourceCommitId)) {
    return false;
  }

  const source = changeByCommitId(changes, sourceCommitId);
  const destination = changeByCommitId(changes, destinationCommitId);
  if (!source || !destination) return false;

  const changesById = new Map(changes.map((change) => [change.changeId, change]));
  return !hasAncestor(changesById, destination.changeId, source.changeId);
}

export function estimateRebaseTopology(
  changes: ChangeRow[],
  sourceCommitId: string | null,
  destinationCommitId: string | null,
): RebaseTopologyPreview | null {
  if (
    !sourceCommitId ||
    !destinationCommitId ||
    !canPreviewRebase(changes, sourceCommitId, destinationCommitId)
  ) {
    return null;
  }

  const source = changeByCommitId(changes, sourceCommitId);
  const destination = changeByCommitId(changes, destinationCommitId);
  if (!source || !destination) return null;

  return {
    source,
    destination,
    changes: changes.map((change) =>
      change.changeId === source.changeId
        ? {
            ...change,
            parents: [destination.changeId],
            parentCommitIds: [destination.commitId],
          }
        : change,
    ),
  };
}
