import { describe, expect, it } from "vitest";
import {
  clampSplitterSize,
  splitterBounds,
  splitterSizeForKey,
} from "./splitter";

describe("splitter sizing", () => {
  const bounds = splitterBounds(700, 140, 180, 5);

  it("preserves minimum space for both panes", () => {
    expect(bounds).toEqual({ min: 180, max: 555 });
    expect(clampSplitterSize(90, bounds)).toBe(180);
    expect(clampSplitterSize(640, bounds)).toBe(555);
  });

  it("supports directional and boundary keyboard controls", () => {
    expect(splitterSizeForKey("ArrowUp", 300, bounds, 24)).toBe(324);
    expect(splitterSizeForKey("ArrowDown", 300, bounds, 24)).toBe(276);
    expect(splitterSizeForKey("Home", 300, bounds, 24)).toBe(180);
    expect(splitterSizeForKey("End", 300, bounds, 24)).toBe(555);
  });

  it("ignores unrelated keys", () => {
    expect(splitterSizeForKey("Enter", 300, bounds, 24)).toBeNull();
  });
});
