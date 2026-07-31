import { describe, expect, it, vi } from "vitest";
import {
  clearLegacyAppUpdateRelaunchFocus,
  LEGACY_APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY,
} from "./appUpdateLegacy";

describe("legacy app update state", () => {
  it("removes the outgoing v0.9.9 foreground marker", () => {
    const storage = { removeItem: vi.fn() };

    clearLegacyAppUpdateRelaunchFocus(storage);

    expect(storage.removeItem).toHaveBeenCalledWith(
      LEGACY_APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY,
    );
  });

  it("does not surface unavailable legacy storage", () => {
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };

    expect(() => clearLegacyAppUpdateRelaunchFocus(storage)).not.toThrow();
  });
});
