import type { ChangeRow } from "../types";

export interface DagEdge {
  fromLane: number;
  toLane: number;
  kind: "continuation" | "parent";
  changeId: string;
  parentIndex?: number;
}

export interface DagRowLayout {
  lane: number;
  laneCount: number;
  hasIncoming: boolean;
  edges: DagEdge[];
}

export interface DagLayout {
  rows: DagRowLayout[];
  maxLaneCount: number;
}

export function dagRowLayoutEquals(
  left: DagRowLayout,
  right: DagRowLayout,
) {
  return (
    left.lane === right.lane &&
    left.laneCount === right.laneCount &&
    left.hasIncoming === right.hasIncoming &&
    left.edges.length === right.edges.length &&
    left.edges.every((edge, index) => {
      const candidate = right.edges[index];
      return (
        candidate !== undefined &&
        edge.fromLane === candidate.fromLane &&
        edge.toLane === candidate.toLane &&
        edge.kind === candidate.kind &&
        edge.changeId === candidate.changeId &&
        edge.parentIndex === candidate.parentIndex
      );
    })
  );
}

export function changedDagLanesInRange(
  currentRows: readonly DagRowLayout[],
  proposedRows: readonly DagRowLayout[],
  startIndex: number,
  endIndex: number,
) {
  const lanes = new Set<number>();
  const boundedStart = Math.max(0, startIndex);
  const boundedEnd = Math.min(
    currentRows.length,
    proposedRows.length,
    endIndex,
  );

  for (let index = boundedStart; index < boundedEnd; index += 1) {
    const current = currentRows[index];
    const proposed = proposedRows[index];
    if (!current || !proposed || dagRowLayoutEquals(current, proposed)) {
      continue;
    }

    lanes.add(proposed.lane);
    for (const edge of proposed.edges) {
      lanes.add(edge.fromLane);
      lanes.add(edge.toLane);
    }
  }

  return [...lanes].sort((left, right) => left - right);
}

function unique(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

export function layoutDag(changes: ChangeRow[]): DagLayout {
  let active: string[] = [];
  let maxLaneCount = 1;
  const rows = changes.map((change) => {
    let lane = active.indexOf(change.changeId);
    const hasIncoming = lane >= 0;
    if (lane < 0) {
      lane = active.length;
      active = [...active, change.changeId];
    }

    const before = active;
    const after = before.filter((candidate) => candidate !== change.changeId);
    const parents = unique(change.parents);

    parents.forEach((parent, parentIndex) => {
      if (after.includes(parent)) return;
      const insertionLane = Math.min(lane + parentIndex, after.length);
      after.splice(insertionLane, 0, parent);
    });

    const edges: DagEdge[] = [];
    before.forEach((candidate, fromLane) => {
      if (candidate === change.changeId) return;
      const toLane = after.indexOf(candidate);
      if (toLane >= 0) {
        edges.push({
          fromLane,
          toLane,
          kind: "continuation",
          changeId: candidate,
        });
      }
    });
    parents.forEach((parent, parentIndex) => {
      const toLane = after.indexOf(parent);
      if (toLane >= 0) {
        edges.push({
          fromLane: lane,
          toLane,
          kind: "parent",
          changeId: parent,
          parentIndex,
        });
      }
    });

    const laneCount = Math.max(before.length, after.length, lane + 1, 1);
    maxLaneCount = Math.max(maxLaneCount, laneCount);
    active = after;
    return { lane, laneCount, hasIncoming, edges };
  });

  return { rows, maxLaneCount };
}
