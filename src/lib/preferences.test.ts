import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIFF_VIEW_MODE,
  DIFF_VIEW_MODE_STORAGE_KEY,
  loadDiffViewMode,
  saveDiffViewMode,
} from "./preferences";

function storageWith(value: string | null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

describe("diff view mode preferences", () => {
  it.each(["unified", "sideBySide"] as const)(
    "restores the saved %s mode",
    (mode) => {
      const storage = storageWith(mode);

      expect(loadDiffViewMode(storage)).toBe(mode);
      expect(storage.getItem).toHaveBeenCalledWith(DIFF_VIEW_MODE_STORAGE_KEY);
    },
  );

  it("falls back when the preference is missing or invalid", () => {
    expect(loadDiffViewMode(storageWith(null))).toBe(DEFAULT_DIFF_VIEW_MODE);
    expect(loadDiffViewMode(storageWith("side-by-side"))).toBe(
      DEFAULT_DIFF_VIEW_MODE,
    );
  });

  it("falls back when browser storage cannot be read", () => {
    const storage = storageWith(null);
    storage.getItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(loadDiffViewMode(storage)).toBe(DEFAULT_DIFF_VIEW_MODE);
  });

  it("saves the selected mode without surfacing storage failures", () => {
    const storage = storageWith(null);

    saveDiffViewMode("sideBySide", storage);
    expect(storage.setItem).toHaveBeenCalledWith(
      DIFF_VIEW_MODE_STORAGE_KEY,
      "sideBySide",
    );

    storage.setItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => saveDiffViewMode("unified", storage)).not.toThrow();
  });
});
