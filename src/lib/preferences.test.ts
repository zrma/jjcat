import { describe, expect, it, vi } from "vitest";
import {
  clearInspectorHeightRatio,
  DEFAULT_DIFF_VIEW_MODE,
  DIFF_VIEW_MODE_STORAGE_KEY,
  INSPECTOR_HEIGHT_RATIO_STORAGE_KEY,
  loadDiffViewMode,
  loadInspectorHeightRatio,
  saveDiffViewMode,
  saveInspectorHeightRatio,
} from "./preferences";

function storageWith(value: string | null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
    removeItem: vi.fn(),
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

describe("inspector height preferences", () => {
  it("restores a valid versioned ratio", () => {
    const storage = storageWith("0.625");

    expect(loadInspectorHeightRatio(storage)).toBe(0.625);
    expect(storage.getItem).toHaveBeenCalledWith(
      INSPECTOR_HEIGHT_RATIO_STORAGE_KEY,
    );
  });

  it.each([null, "", "not-a-number", "0", "1", "-0.1", "1.1"])(
    "rejects an invalid stored ratio: %s",
    (value) => {
      expect(loadInspectorHeightRatio(storageWith(value))).toBeNull();
    },
  );

  it("saves a bounded ratio and clears the customized layout", () => {
    const storage = storageWith(null);

    saveInspectorHeightRatio(0.625, storage);
    expect(storage.setItem).toHaveBeenCalledWith(
      INSPECTOR_HEIGHT_RATIO_STORAGE_KEY,
      "0.625000",
    );

    clearInspectorHeightRatio(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(
      INSPECTOR_HEIGHT_RATIO_STORAGE_KEY,
    );
  });

  it("does not surface storage failures", () => {
    const storage = storageWith(null);
    storage.getItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    storage.setItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    storage.removeItem.mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(loadInspectorHeightRatio(storage)).toBeNull();
    expect(() => saveInspectorHeightRatio(0.5, storage)).not.toThrow();
    expect(() => clearInspectorHeightRatio(storage)).not.toThrow();
  });
});
