import type { ChangeRow } from "../types";

export interface RebaseTopologyPreview {
  changes: ChangeRow[];
  source: ChangeRow;
  destination: ChangeRow;
  affectedChangeIds: ReadonlySet<string>;
}

function changeByCommitId(changes: ChangeRow[], commitId: string) {
  return changes.find((change) => change.commitId === commitId);
}

function stableTopologicalOrder(changes: ChangeRow[]) {
  const byId = new Map(changes.map((change) => [change.changeId, change]));
  const originalIndex = new Map(
    changes.map((change, index) => [change.changeId, index]),
  );
  const incoming = new Map(
    changes.map((change) => [change.changeId, 0]),
  );

  for (const change of changes) {
    for (const parent of new Set(change.parents)) {
      if (!byId.has(parent)) continue;
      incoming.set(parent, (incoming.get(parent) ?? 0) + 1);
    }
  }

  const ready = changes
    .filter((change) => incoming.get(change.changeId) === 0)
    .sort(
      (left, right) =>
        (originalIndex.get(left.changeId) ?? 0) -
        (originalIndex.get(right.changeId) ?? 0),
    );
  const ordered: ChangeRow[] = [];

  while (ready.length > 0) {
    const change = ready.shift();
    if (!change) break;
    ordered.push(change);

    for (const parent of new Set(change.parents)) {
      if (!byId.has(parent)) continue;
      const remaining = (incoming.get(parent) ?? 0) - 1;
      incoming.set(parent, remaining);
      if (remaining !== 0) continue;
      const parentChange = byId.get(parent);
      if (!parentChange) continue;
      const insertionIndex = ready.findIndex(
        (candidate) =>
          (originalIndex.get(candidate.changeId) ?? 0) >
          (originalIndex.get(parentChange.changeId) ?? 0),
      );
      if (insertionIndex < 0) ready.push(parentChange);
      else ready.splice(insertionIndex, 0, parentChange);
    }
  }

  return ordered.length === changes.length ? ordered : changes;
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

  const reparented = changes.map((change) =>
    change.changeId === source.changeId
      ? {
          ...change,
          parents: [destination.changeId],
          parentCommitIds: [destination.commitId],
        }
      : change,
  );
  const changesById = new Map(changes.map((change) => [change.changeId, change]));
  const affectedChangeIds = new Set<string>([
    source.changeId,
    destination.changeId,
  ]);
  for (const change of changes) {
    if (hasAncestor(changesById, change.changeId, source.changeId)) {
      affectedChangeIds.add(change.changeId);
    }
  }

  return {
    source,
    destination,
    affectedChangeIds,
    changes: stableTopologicalOrder(reparented),
  };
}
