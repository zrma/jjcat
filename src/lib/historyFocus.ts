import type { HistoryFoldItem } from "./historyFolding";

// 접힌 구간이 합쳐져 ID가 달라져도 원래 source 위치를 포함하는 control을 찾는다.
export function historyFoldFocusTarget(
  items: HistoryFoldItem[],
  sourceIndex: number,
  selectedChangeId?: string,
) {
  const foldIndex = items.findIndex(item => item.kind === "fold" &&
    item.startIndex <= sourceIndex && item.endIndex >= sourceIndex);
  if (foldIndex >= 0) return { index: foldIndex, item: items[foldIndex] };
  const selectedIndex = items.findIndex(item => item.kind === "change" &&
    item.change.changeId === selectedChangeId);
  const index = selectedIndex >= 0 ? selectedIndex : items.findIndex(item => item.kind === "change");
  return index >= 0 ? { index, item: items[index] } : null;
}
