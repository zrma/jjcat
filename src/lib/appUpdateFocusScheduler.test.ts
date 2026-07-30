import { describe, expect, it, vi } from "vitest";
import { APP_UPDATE_FOCUS_DELAY_MS } from "./appUpdate";
import { createAppUpdateFocusScheduler } from "./appUpdateFocusScheduler";

describe("app update focus scheduler", () => {
  it("checks after the focus dwell and cancels when focus is lost", () => {
    const check = vi.fn();
    const cancel = vi.fn();
    const scheduled: Array<() => void> = [];
    const scheduler = createAppUpdateFocusScheduler({
      getLastCheckAttemptAt: () => null,
      check,
      now: () => 10_000,
      schedule(handler, delay) {
        expect(delay).toBe(APP_UPDATE_FOCUS_DELAY_MS);
        scheduled.push(handler);
        return 7;
      },
      cancel,
    });

    scheduler.focusChanged(true);
    expect(scheduled).toHaveLength(1);
    scheduler.focusChanged(false);
    expect(cancel).toHaveBeenCalledWith(7);
    scheduled[0]?.();
    expect(check).not.toHaveBeenCalled();

    scheduler.focusChanged(true);
    scheduled[1]?.();
    expect(check).toHaveBeenCalledOnce();
  });

  it("rechecks cooldown when the dwell finishes", () => {
    const check = vi.fn();
    let lastAttemptAt: number | null = null;
    let now = 10_000;
    const scheduled: Array<() => void> = [];
    const scheduler = createAppUpdateFocusScheduler({
      getLastCheckAttemptAt: () => lastAttemptAt,
      check,
      now: () => now,
      schedule(handler) {
        scheduled.push(handler);
        return 11;
      },
      cancel: vi.fn(),
    });

    scheduler.focusChanged(true);
    lastAttemptAt = now;
    now += APP_UPDATE_FOCUS_DELAY_MS;
    scheduled[0]?.();
    expect(check).not.toHaveBeenCalled();
  });
});
