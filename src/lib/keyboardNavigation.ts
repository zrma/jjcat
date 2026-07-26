export type VerticalNavigationDirection = -1 | 1;

export function adjacentNavigationIndex(
  itemCount: number,
  currentIndex: number,
  direction: VerticalNavigationDirection,
) {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return direction > 0 ? 0 : itemCount - 1;
  return Math.max(0, Math.min(itemCount - 1, currentIndex + direction));
}
