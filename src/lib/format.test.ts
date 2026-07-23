import { describe, expect, it } from "vitest";
import { absoluteTime, isStale, locationLabel, relativeTime } from "./format";

describe("projection formatting", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");

  it("formats recent and older changes compactly", () => {
    expect(relativeTime("2026-07-21T11:59:40Z", now)).toBe("Just now");
    expect(relativeTime("2026-07-21T11:42:00Z", now)).toBe("18m ago");
    expect(relativeTime("2026-07-19T12:00:00Z", now)).toBe("2d ago");
  });

  it("formats valid absolute timestamps and rejects invalid values", () => {
    expect(absoluteTime("2026-07-21T12:00:00Z")).toContain("2026");
    expect(absoluteTime("not-a-date")).toBe("Unknown time");
  });

  it("marks caches stale after five minutes", () => {
    expect(isStale("2026-07-21T11:56:00Z", now)).toBe(false);
    expect(isStale("2026-07-21T11:54:00Z", now)).toBe(true);
  });

  it("uses the same transport labels as the desktop shell", () => {
    expect(locationLabel("local")).toBe("Local");
    expect(locationLabel("ssh")).toBe("SSH");
  });
});
