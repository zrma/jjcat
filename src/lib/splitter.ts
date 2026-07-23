export interface SplitterBounds {
  min: number;
  max: number;
}

export function splitterBounds(
  containerHeight: number,
  minPrimary: number,
  minSecondary: number,
  splitterSize: number,
): SplitterBounds {
  return {
    min: minSecondary,
    max: Math.max(minSecondary, containerHeight - minPrimary - splitterSize),
  };
}

export function clampSplitterSize(value: number, bounds: SplitterBounds) {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

export function splitterSizeForKey(
  key: string,
  current: number,
  bounds: SplitterBounds,
  step: number,
): number | null {
  if (key === "ArrowUp") return clampSplitterSize(current + step, bounds);
  if (key === "ArrowDown") return clampSplitterSize(current - step, bounds);
  if (key === "Home") return bounds.min;
  if (key === "End") return bounds.max;
  return null;
}
