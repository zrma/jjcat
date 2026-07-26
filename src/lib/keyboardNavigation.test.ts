import { describe, expect, it } from "vitest";
import { adjacentNavigationIndex } from "./keyboardNavigation";

describe("adjacentNavigationIndex", () => {
  it("moves within the available range", () => {
    expect(adjacentNavigationIndex(4, 1, 1)).toBe(2);
    expect(adjacentNavigationIndex(4, 2, -1)).toBe(1);
  });

  it("stays at either boundary", () => {
    expect(adjacentNavigationIndex(4, 0, -1)).toBe(0);
    expect(adjacentNavigationIndex(4, 3, 1)).toBe(3);
  });

  it("enters an unselected list from the requested edge", () => {
    expect(adjacentNavigationIndex(4, -1, 1)).toBe(0);
    expect(adjacentNavigationIndex(4, -1, -1)).toBe(3);
  });

  it("returns no index for an empty list", () => {
    expect(adjacentNavigationIndex(0, -1, 1)).toBe(-1);
  });
});
