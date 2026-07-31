type LegacyUpdateStorage = Pick<Storage, "removeItem">;

export const LEGACY_APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY =
  "jjcat.appUpdate.relaunchFocus.v1";

function browserStorage(): LegacyUpdateStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearLegacyAppUpdateRelaunchFocus(
  storage: LegacyUpdateStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(LEGACY_APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY);
  } catch {
    // Legacy cleanup must not prevent the incoming app from loading.
  }
}
