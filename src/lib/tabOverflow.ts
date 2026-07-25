export type TabOverflowState = {
  left: boolean;
  right: boolean;
};

const SCROLL_EPSILON = 1;

export function tabOverflowState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): TabOverflowState {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  return {
    left: scrollLeft > SCROLL_EPSILON,
    right: scrollLeft < maxScrollLeft - SCROLL_EPSILON,
  };
}

export function tabScrollPage(clientWidth: number): number {
  return Math.max(112, Math.round(clientWidth * 0.72));
}
