import { describe, expect, it, vi } from "vitest";
import {
  APP_UPDATE_RELAUNCH_FOCUS_MAX_AGE_MS,
  APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY,
  clearAppUpdateRelaunchFocus,
  consumeAppUpdateRelaunchFocus,
  markAppUpdateRelaunchFocus,
  relaunchAppUpdateWithFocusIntent,
  restoreAppUpdateRelaunchFocus,
} from "./appUpdateRelaunch";

function memoryStorage(initialValue: string | null = null) {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set(APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY, initialValue);
  }
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

describe("app update relaunch focus", () => {
  it("consumes a recent foreground intent exactly once", () => {
    const storage = memoryStorage();
    markAppUpdateRelaunchFocus(storage, 10_000);

    expect(storage.setItem).toHaveBeenCalledWith(
      APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY,
      "10000",
    );
    expect(consumeAppUpdateRelaunchFocus(storage, 10_001)).toBe(true);
    expect(consumeAppUpdateRelaunchFocus(storage, 10_002)).toBe(false);
  });

  it.each([
    ["invalid", 20_000],
    ["21000", 20_000],
    ["10000", 10_000 + APP_UPDATE_RELAUNCH_FOCUS_MAX_AGE_MS + 1],
  ])("rejects and removes an invalid or stale intent", (value, now) => {
    const storage = memoryStorage(value);

    expect(consumeAppUpdateRelaunchFocus(storage, now)).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith(
      APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY,
    );
  });

  it("shows the relaunched main window before focusing it", async () => {
    const storage = memoryStorage("10000");
    const calls: string[] = [];
    const windowHandle = {
      show: vi.fn(async () => {
        calls.push("show");
      }),
      setFocus: vi.fn(async () => {
        calls.push("focus");
      }),
    };

    await expect(
      restoreAppUpdateRelaunchFocus(windowHandle, storage, 10_001),
    ).resolves.toBe(true);
    expect(calls).toEqual(["show", "focus"]);

    await expect(
      restoreAppUpdateRelaunchFocus(windowHandle, storage, 10_002),
    ).resolves.toBe(false);
    expect(calls).toEqual(["show", "focus"]);
  });

  it("clears the intent when relaunch fails", async () => {
    const storage = memoryStorage();
    const restartError = new Error("restart failed");

    await expect(
      relaunchAppUpdateWithFocusIntent(
        () => Promise.reject(restartError),
        storage,
        10_000,
      ),
    ).rejects.toBe(restartError);
    expect(consumeAppUpdateRelaunchFocus(storage, 10_001)).toBe(false);
  });

  it("does not surface unavailable storage during mark or cleanup", () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => markAppUpdateRelaunchFocus(storage)).not.toThrow();
    expect(() => clearAppUpdateRelaunchFocus(storage)).not.toThrow();
  });
});
