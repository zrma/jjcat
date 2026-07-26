import { describe, expect, it } from "vitest";
import { anchoredPopupPosition } from "./popupPosition";

describe("anchoredPopupPosition", () => {
  it("opens below the anchor without crossing the viewport edge", () => {
    expect(
      anchoredPopupPosition({
        anchor: { left: 160, top: 72, bottom: 96 },
        popupWidth: 242,
        popupHeight: 108,
        viewportWidth: 900,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 160, top: 100 });
  });

  it("keeps a wide popup fully visible near either horizontal edge", () => {
    expect(
      anchoredPopupPosition({
        anchor: { left: -18, top: 72, bottom: 96 },
        popupWidth: 242,
        popupHeight: 108,
        viewportWidth: 360,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 8, top: 100 });
    expect(
      anchoredPopupPosition({
        anchor: { left: 330, top: 72, bottom: 96 },
        popupWidth: 242,
        popupHeight: 108,
        viewportWidth: 360,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 110, top: 100 });
  });

  it("opens above the anchor when there is not enough room below", () => {
    expect(
      anchoredPopupPosition({
        anchor: { left: 160, top: 520, bottom: 544 },
        popupWidth: 242,
        popupHeight: 108,
        viewportWidth: 900,
        viewportHeight: 600,
      }),
    ).toEqual({ left: 160, top: 408 });
  });
});
