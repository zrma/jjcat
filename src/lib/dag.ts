import type { ChangeRow } from "../types";

export interface DagEdge {
  fromLane: number;
  toLane: number;
  kind: "continuation" | "parent";
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
      if (toLane >= 0) edges.push({ fromLane, toLane, kind: "continuation" });
    });
    parents.forEach((parent, parentIndex) => {
      const toLane = after.indexOf(parent);
      if (toLane >= 0) edges.push({ fromLane: lane, toLane, kind: "parent", parentIndex });
    });

    const laneCount = Math.max(before.length, after.length, lane + 1, 1);
    maxLaneCount = Math.max(maxLaneCount, laneCount);
    active = after;
    return { lane, laneCount, hasIncoming, edges };
  });

  return { rows, maxLaneCount };
}
