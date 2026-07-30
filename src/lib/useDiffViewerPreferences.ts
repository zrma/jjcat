import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { isTauriRuntime } from "../bridge";
import type { DiffViewMode, WhitespaceMode } from "../types";
import {
  DEFAULT_DIFF_VIEW_MODE,
  DEFAULT_WHITESPACE_MODE,
  DIFF_VIEW_MODE_STORAGE_KEY,
  loadDiffViewMode,
  loadWhitespaceMode,
  saveDiffViewMode,
  saveWhitespaceMode,
  WHITESPACE_MODE_STORAGE_KEY,
} from "./preferences";

export const DIFF_VIEWER_PREFERENCES_CHANGED_EVENT =
  "jjcat://diff-viewer-preferences-changed";

export interface DiffViewerPreferenceChange {
  viewMode?: DiffViewMode;
  whitespaceMode?: WhitespaceMode;
}

export function parseDiffViewerPreferenceChange(
  payload: unknown,
): DiffViewerPreferenceChange | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const change: DiffViewerPreferenceChange = {};
  if (
    candidate.viewMode === "unified" ||
    candidate.viewMode === "sideBySide"
  ) {
    change.viewMode = candidate.viewMode;
  } else if ("viewMode" in candidate) {
    return null;
  }
  if (
    candidate.whitespaceMode === "preserve" ||
    candidate.whitespaceMode === "ignoreAll"
  ) {
    change.whitespaceMode = candidate.whitespaceMode;
  } else if ("whitespaceMode" in candidate) {
    return null;
  }

  return change.viewMode || change.whitespaceMode ? change : null;
}

function publishPreferenceChange(change: DiffViewerPreferenceChange) {
  if (!isTauriRuntime) {
    return;
  }
  void emit(DIFF_VIEWER_PREFERENCES_CHANGED_EVENT, change).catch(() => {
    // Local persistence still owns the preference if window sync is unavailable.
  });
}

export function useDiffViewerPreferences(
  fallbackViewMode: DiffViewMode = DEFAULT_DIFF_VIEW_MODE,
  fallbackWhitespaceMode: WhitespaceMode = DEFAULT_WHITESPACE_MODE,
) {
  const [viewMode, setViewModeState] = useState<DiffViewMode>(() =>
    loadDiffViewMode(undefined, fallbackViewMode),
  );
  const [whitespaceMode, setWhitespaceModeState] = useState<WhitespaceMode>(() =>
    loadWhitespaceMode(undefined, fallbackWhitespaceMode),
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === DIFF_VIEW_MODE_STORAGE_KEY) {
        setViewModeState(loadDiffViewMode(undefined, fallbackViewMode));
      }
      if (event.key === null || event.key === WHITESPACE_MODE_STORAGE_KEY) {
        setWhitespaceModeState(
          loadWhitespaceMode(undefined, fallbackWhitespaceMode),
        );
      }
    };
    window.addEventListener("storage", handleStorage);

    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    if (isTauriRuntime) {
      void listen<unknown>(
        DIFF_VIEWER_PREFERENCES_CHANGED_EVENT,
        ({ payload }) => {
          const change = parseDiffViewerPreferenceChange(payload);
          if (!change) {
            return;
          }
          if (change.viewMode) {
            saveDiffViewMode(change.viewMode);
            setViewModeState(change.viewMode);
          }
          if (change.whitespaceMode) {
            saveWhitespaceMode(change.whitespaceMode);
            setWhitespaceModeState(change.whitespaceMode);
          }
        },
      )
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
          } else {
            unlisten = nextUnlisten;
          }
        })
        .catch(() => {
          // Storage-event synchronization remains available in browser windows.
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener("storage", handleStorage);
      unlisten?.();
    };
  }, [fallbackViewMode, fallbackWhitespaceMode]);

  const setViewMode = useCallback((mode: DiffViewMode) => {
    saveDiffViewMode(mode);
    setViewModeState(mode);
    publishPreferenceChange({ viewMode: mode });
  }, []);

  const setWhitespaceMode = useCallback((mode: WhitespaceMode) => {
    saveWhitespaceMode(mode);
    setWhitespaceModeState(mode);
    publishPreferenceChange({ whitespaceMode: mode });
  }, []);

  return {
    viewMode,
    whitespaceMode,
    setViewMode,
    setWhitespaceMode,
  };
}
