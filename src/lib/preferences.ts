import type { DiffViewMode } from "../types";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_DIFF_VIEW_MODE: DiffViewMode = "unified";
export const DIFF_VIEW_MODE_STORAGE_KEY = "jjcat.diffViewMode";

function browserPreferenceStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDiffViewMode(
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): DiffViewMode {
  if (!storage) {
    return DEFAULT_DIFF_VIEW_MODE;
  }

  try {
    const value = storage.getItem(DIFF_VIEW_MODE_STORAGE_KEY);
    return value === "sideBySide" || value === "unified"
      ? value
      : DEFAULT_DIFF_VIEW_MODE;
  } catch {
    return DEFAULT_DIFF_VIEW_MODE;
  }
}

export function saveDiffViewMode(
  mode: DiffViewMode,
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(DIFF_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Preferences must not prevent the repository cockpit from loading.
  }
}
