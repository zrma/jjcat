import type { ChangeRow } from "../types";

export const HISTORY_REVEAL_STEP = 10;
const ANCHOR_CONTEXT = 1;
const MIN_FOLD_SIZE = 4;

export type HistoryFoldItem =
  | {
      kind: "change";
      change: ChangeRow;
      sourceIndex: number;
    }
  | {
      kind: "fold";
      id: string;
      startIndex: number;
      endIndex: number;
      totalCount: number;
      shownCount: number;
      hiddenCount: number;
    };

function isReferenceAnchor(change: ChangeRow) {
  return (
    change.workingCopy ||
    change.conflict ||
    change.bookmarks.length > 0 ||
    (change.workspaceCopies?.length ?? 0) > 0
  );
}

function gapId(changes: ChangeRow[], startIndex: number, endIndex: number) {
  const newer = changes[startIndex - 1]?.changeId ?? "head";
  const older = changes[endIndex + 1]?.changeId ?? "tail";
  return `${newer}:${older}:${startIndex}:${endIndex}`;
}

function markAnchorContext(visible: boolean[], anchor: number) {
  const start = Math.max(0, anchor - ANCHOR_CONTEXT);
  const end = Math.min(visible.length - 1, anchor + ANCHOR_CONTEXT);
  for (let index = start; index <= end; index += 1) visible[index] = true;
}

function isRenderedByBaseFolds(
  changes: ChangeRow[],
  selectedIndex: number,
  visible: readonly boolean[],
  revealedByGap: Readonly<Record<string, number>>,
) {
  if (visible[selectedIndex]) return true;

  let index = 0;
  while (index < changes.length) {
    if (visible[index]) {
      index += 1;
      continue;
    }

    const startIndex = index;
    while (index < changes.length && !visible[index]) index += 1;
    const endIndex = index - 1;
    const totalCount = endIndex - startIndex + 1;
    if (totalCount < MIN_FOLD_SIZE) {
      if (selectedIndex >= startIndex && selectedIndex <= endIndex) return true;
      continue;
    }

    const id = gapId(changes, startIndex, endIndex);
    const shownCount = Math.min(
      totalCount,
      Math.max(0, revealedByGap[id] ?? 0),
    );
    if (
      selectedIndex >= startIndex &&
      selectedIndex < startIndex + shownCount
    ) {
      return true;
    }
  }

  return false;
}

export function foldHistory(
  changes: ChangeRow[],
  selectedChangeId: string | undefined,
  revealedByGap: Readonly<Record<string, number>>,
  enabled = true,
  additionalAnchorChangeIds: readonly string[] = [],
): HistoryFoldItem[] {
  if (!enabled || changes.length === 0) {
    return changes.map((change, sourceIndex) => ({
      kind: "change",
      change,
      sourceIndex,
    }));
  }

  const visible = Array.from({ length: changes.length }, () => false);
  const additionalAnchors = new Set(additionalAnchorChangeIds);
  const anchors = new Set<number>([0]);
  changes.forEach((change, index) => {
    if (
      isReferenceAnchor(change) ||
      additionalAnchors.has(change.changeId)
    ) {
      anchors.add(index);
    }
  });
  for (const anchor of anchors) markAnchorContext(visible, anchor);

  const selectedIndex = selectedChangeId
    ? changes.findIndex((change) => change.changeId === selectedChangeId)
    : -1;
  if (
    selectedIndex >= 0 &&
    !isRenderedByBaseFolds(
      changes,
      selectedIndex,
      visible,
      revealedByGap,
    )
  ) {
    markAnchorContext(visible, selectedIndex);
  }

  const items: HistoryFoldItem[] = [];
  let index = 0;
  while (index < changes.length) {
    if (visible[index]) {
      items.push({ kind: "change", change: changes[index], sourceIndex: index });
      index += 1;
      continue;
    }

    const startIndex = index;
    while (index < changes.length && !visible[index]) index += 1;
    const endIndex = index - 1;
    const totalCount = endIndex - startIndex + 1;
    if (totalCount < MIN_FOLD_SIZE) {
      for (let sourceIndex = startIndex; sourceIndex <= endIndex; sourceIndex += 1) {
        items.push({
          kind: "change",
          change: changes[sourceIndex],
          sourceIndex,
        });
      }
      continue;
    }

    const id = gapId(changes, startIndex, endIndex);
    const shownCount = Math.min(
      totalCount,
      Math.max(0, revealedByGap[id] ?? 0),
    );
    for (
      let sourceIndex = startIndex;
      sourceIndex < startIndex + shownCount;
      sourceIndex += 1
    ) {
      items.push({
        kind: "change",
        change: changes[sourceIndex],
        sourceIndex,
      });
    }
    items.push({
      kind: "fold",
      id,
      startIndex,
      endIndex,
      totalCount,
      shownCount,
      hiddenCount: totalCount - shownCount,
    });
  }
  return items;
}
