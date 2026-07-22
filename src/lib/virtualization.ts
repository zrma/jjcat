export interface VirtualRange {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function virtualRange(
  itemCount: number,
  rowHeight: number,
  viewportHeight: number,
  scrollTop: number,
  overscan: number,
): VirtualRange {
  if (itemCount <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight: 0 };
  }

  const safeViewport = Math.max(0, viewportHeight);
  const totalHeight = itemCount * rowHeight;
  const safeScrollTop = Math.min(Math.max(0, scrollTop), Math.max(0, totalHeight - safeViewport));
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const startIndex = Math.max(0, Math.floor(safeScrollTop / rowHeight) - safeOverscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((safeScrollTop + safeViewport) / rowHeight) + safeOverscan,
  );

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    totalHeight,
  };
}
