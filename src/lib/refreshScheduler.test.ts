import { describe, expect, it } from "vitest";
import { failureBackoffMs, nextRefreshDelayMs, planRepositoryRefreshes } from "./refreshScheduler";

describe("background refresh scheduling", () => {
  it("uses shorter active intervals and immediately schedules missing or stale caches", () => {
    const now = Date.parse("2026-01-02T03:04:05Z");
    expect(
      nextRefreshDelayMs({
        active: true,
        failureCount: 0,
        cachedAt: "2026-01-02T03:03:55Z",
        now,
      }),
    ).toBe(20_000);
    expect(
      nextRefreshDelayMs({
        active: false,
        failureCount: 0,
        cachedAt: "2026-01-02T03:00:00Z",
        now,
      }),
    ).toBe(1_000);
    expect(nextRefreshDelayMs({ active: false, failureCount: 0, now })).toBe(1_000);
  });

  it("backs off failures with a bounded exponential delay", () => {
    expect([1, 2, 3, 8].map(failureBackoffMs)).toEqual([15_000, 30_000, 60_000, 300_000]);
  });

  it("plans exactly one timer per open repository", () => {
    const plan = planRepositoryRefreshes(["one", "one", "two"], "one", {}, { two: 2 }, 0);
    expect(plan).toEqual([
      { repositoryId: "one", delayMs: 1_000 },
      { repositoryId: "two", delayMs: 30_000 },
    ]);
  });
});
