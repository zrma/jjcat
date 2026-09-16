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

export type HistoryExpansion = {
  revealedChangeIds: ReadonlySet<string>;
  contextAnchorChangeIds: ReadonlySet<string>;
};

export function updateHistoryExpansion(
  changes: ChangeRow[],
  current: HistoryExpansion,
  fold: Extract<HistoryFoldItem, { kind: "fold" }>,
  count: number,
  selectedChangeId?: string,
): HistoryExpansion {
  const revealedChangeIds = revealHistoryFold(changes, current.revealedChangeIds, fold, count);
  const anchors = new Set(current.contextAnchorChangeIds);
  const selectedIndex = changes.findIndex(change => change.changeId === selectedChangeId);
  // 클릭한 구간을 나누던 선택 문맥만 고정한다. 반대쪽 숨긴 구간은 펼치지 않는다.
  if (count > 0 && selectedChangeId && selectedIndex >= 0 &&
    !current.revealedChangeIds.has(selectedChangeId) &&
    (selectedIndex + ANCHOR_CONTEXT + 1 === fold.startIndex ||
      selectedIndex - ANCHOR_CONTEXT - 1 === fold.endIndex)) {
    anchors.add(selectedChangeId);
  }
  // 양옆의 펼침이 모두 접힌 경계는 해제한다. 현재 선택의 문맥은 foldHistory가 노출한다.
  const anchoredFolds = foldHistory(changes, undefined, revealedChangeIds, true, [...anchors])
    .filter(item => item.kind === "fold");
  const contextAnchorChangeIds = new Set([...anchors].filter(id => {
    const index = changes.findIndex(change => change.changeId === id);
    return index >= 0 && anchoredFolds.some(item => item.shownCount > 0 && (
      item.endIndex === index - ANCHOR_CONTEXT - 1 ||
      item.startIndex === index + ANCHOR_CONTEXT + 1));
  }));
  return { revealedChangeIds, contextAnchorChangeIds };
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
