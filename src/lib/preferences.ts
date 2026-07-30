import type { DiffViewMode, WhitespaceMode } from "../types";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_DIFF_VIEW_MODE: DiffViewMode = "unified";
export const DEFAULT_WHITESPACE_MODE: WhitespaceMode = "preserve";
export const DIFF_VIEW_MODE_STORAGE_KEY = "jjcat.diffViewMode";
export const WHITESPACE_MODE_STORAGE_KEY = "jjcat.diffWhitespaceMode";
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
  fallback: DiffViewMode = DEFAULT_DIFF_VIEW_MODE,
): DiffViewMode {
  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(DIFF_VIEW_MODE_STORAGE_KEY);
    return value === "sideBySide" || value === "unified" ? value : fallback;
  } catch {
    return fallback;
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

export function loadWhitespaceMode(
  storage: PreferenceStorage | null = browserPreferenceStorage(),
  fallback: WhitespaceMode = DEFAULT_WHITESPACE_MODE,
): WhitespaceMode {
  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(WHITESPACE_MODE_STORAGE_KEY);
    return value === "preserve" || value === "ignoreAll" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveWhitespaceMode(
  mode: WhitespaceMode,
  storage: PreferenceStorage | null = browserPreferenceStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(WHITESPACE_MODE_STORAGE_KEY, mode);
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
