import type { DiffViewMode } from "../types";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_DIFF_VIEW_MODE: DiffViewMode = "unified";
export const DIFF_VIEW_MODE_STORAGE_KEY = "jjcat.diffViewMode";
export const INSPECTOR_HEIGHT_RATIO_STORAGE_KEY =
  "jjcat.layout.inspectorHeightRatio.v1";

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

export function loadInspectorHeightRatio(
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): number | null {
  if (!storage) {
    return null;
  }

  try {
    const value = Number(storage.getItem(INSPECTOR_HEIGHT_RATIO_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
}

export function saveInspectorHeightRatio(
  ratio: number,
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): void {
  if (!storage || !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    return;
  }

  try {
    storage.setItem(INSPECTOR_HEIGHT_RATIO_STORAGE_KEY, ratio.toFixed(6));
  } catch {
    // Preferences must not prevent the repository cockpit from loading.
  }
}

export function clearInspectorHeightRatio(
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(INSPECTOR_HEIGHT_RATIO_STORAGE_KEY);
  } catch {
    // Preferences must not prevent the repository cockpit from loading.
  }
}
