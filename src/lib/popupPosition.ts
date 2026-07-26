export type PopupAnchor = {
  left: number;
  top: number;
  bottom: number;
};

type AnchoredPopupPositionOptions = {
  anchor: PopupAnchor;
  popupWidth: number;
  popupHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number;
};

export type PopupPosition = {
  left: number;
  top: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function anchoredPopupPosition({
  anchor,
  popupWidth,
  popupHeight,
  viewportWidth,
  viewportHeight,
  gap = 4,
  margin = 8,
}: AnchoredPopupPositionOptions): PopupPosition {
  const maximumLeft = Math.max(margin, viewportWidth - popupWidth - margin);
  const left = clamp(anchor.left, margin, maximumLeft);
  const below = anchor.bottom + gap;
  const maximumTop = Math.max(margin, viewportHeight - popupHeight - margin);
  const top =
    below + popupHeight <= viewportHeight - margin
      ? below
      : clamp(anchor.top - popupHeight - gap, margin, maximumTop);

  return { left, top };
}
