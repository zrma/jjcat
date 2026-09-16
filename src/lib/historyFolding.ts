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
    change.tags.length > 0 ||
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

export function revealHistoryFold(
  changes: ChangeRow[],
  revealedChangeIds: ReadonlySet<string>,
  fold: Extract<HistoryFoldItem, { kind: "fold" }>,
  count: number,
): Set<string> {
  const next = new Set(revealedChangeIds);
  for (let index = fold.startIndex; index <= fold.endIndex; index += 1) {
    const id = changes[index].changeId;
    if (index < fold.startIndex + count) next.add(id);
    else next.delete(id);
  }
  return next;
}

// 전체 펼침은 선택 때문에 나뉜 임시 구간이 아니라 reference 사이의 원래 구간을 대상으로 한다.
export function revealHistorySection(
  changes: ChangeRow[],
  revealedChangeIds: ReadonlySet<string>,
  fold: Extract<HistoryFoldItem, { kind: "fold" }>,
): Set<string> {
  const section = foldHistory(changes, undefined, new Set()).find(
    (item) => item.kind === "fold" &&
      item.startIndex <= fold.startIndex && item.endIndex >= fold.endIndex,
  );
  if (section?.kind !== "fold") return new Set(revealedChangeIds);
  return revealHistoryFold(changes, revealedChangeIds, section, section.totalCount);
}

export function foldHistory(
  changes: ChangeRow[],
  selectedChangeId: string | undefined,
  revealedChangeIds: ReadonlySet<string>,
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

  // 작은 기본 구간은 selection과 무관하게 항상 노출한다.
  for (let index = 0; index < changes.length;) {
    if (visible[index]) {
      index += 1;
      continue;
    }
    const start = index;
    while (index < changes.length && !visible[index]) index += 1;
    if (index - start < MIN_FOLD_SIZE) visible.fill(true, start, index);
  }

  const selectedIndex = selectedChangeId
    ? changes.findIndex((change) => change.changeId === selectedChangeId)
    : -1;
  if (
    selectedIndex >= 0 &&
    !visible[selectedIndex] &&
    !revealedChangeIds.has(changes[selectedIndex].changeId)
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
    // 명시적으로 펼친 prefix와 그 뒤의 숨긴 구간을 하나의 control로 묶는다.
    // 다음 펼침 island 앞에서 멈춰 fold row가 실제 숨긴 위치를 유지하게 한다.
    while (
      index < changes.length && !visible[index] &&
      revealedChangeIds.has(changes[index].changeId)
    ) index += 1;
    const shownCount = index - startIndex;
    while (
      index < changes.length && !visible[index] &&
      !revealedChangeIds.has(changes[index].changeId)
    ) index += 1;
    const endIndex = index - 1;
    const totalCount = endIndex - startIndex + 1;
    if (totalCount < MIN_FOLD_SIZE && shownCount === 0) {
      for (let sourceIndex = startIndex; sourceIndex <= endIndex; sourceIndex += 1) {
        items.push({ kind: "change", change: changes[sourceIndex], sourceIndex });
      }
      continue;
    }

    const id = gapId(changes, startIndex, endIndex);
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
