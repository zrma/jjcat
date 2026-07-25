import { describe, expect, it } from "vitest";
import { tabOverflowState, tabScrollPage } from "./tabOverflow";

describe("tabOverflowState", () => {
  it("hides both directions when every tab fits", () => {
    expect(tabOverflowState(0, 640, 640)).toEqual({
      left: false,
      right: false,
    });
  });

  it("shows only the available direction at either edge", () => {
    expect(tabOverflowState(0, 320, 900)).toEqual({
      left: false,
      right: true,
    });
    expect(tabOverflowState(580, 320, 900)).toEqual({
      left: true,
      right: false,
    });
  });

  it("shows both directions in the middle and tolerates subpixel edges", () => {
    expect(tabOverflowState(240, 320, 900)).toEqual({
      left: true,
      right: true,
    });
    expect(tabOverflowState(579.5, 320, 900)).toEqual({
      left: true,
      right: false,
    });
  });
});

describe("tabScrollPage", () => {
  it("moves a useful fraction of the visible strip", () => {
    expect(tabScrollPage(500)).toBe(360);
  });

  it("moves by at least one compact repository tab", () => {
    expect(tabScrollPage(100)).toBe(112);
  });
});
