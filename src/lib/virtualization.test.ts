import { describe, expect, it } from "vitest";
import { virtualRange } from "./virtualization";

describe("virtualRange", () => {
  it("bounds the rendered window for a representative large graph", () => {
    const range = virtualRange(10_000, 34, 680, 170_000, 6);

    expect(range.totalHeight).toBe(340_000);
    expect(range.offsetTop).toBe(range.startIndex * 34);
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(32);
    expect(range.startIndex).toBeGreaterThan(4_900);
  });

  it("clamps the first and final windows", () => {
    expect(virtualRange(160, 34, 340, 0, 6)).toEqual({
      startIndex: 0,
      endIndex: 16,
      offsetTop: 0,
      totalHeight: 5_440,
    });
    const finalRange = virtualRange(160, 34, 340, 99_999, 6);
    expect(finalRange.endIndex).toBe(160);
    expect(finalRange.startIndex).toBeLessThan(finalRange.endIndex);
  });

  it("returns an empty window for an empty graph", () => {
    expect(virtualRange(0, 34, 500, 0, 6)).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0,
    });
  });
});
