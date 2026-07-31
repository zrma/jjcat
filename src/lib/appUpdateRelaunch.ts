type RelaunchIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RelaunchFocusWindow {
  show(): Promise<void>;
  setFocus(): Promise<void>;
}

export const APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY =
  "jjcat.appUpdate.relaunchFocus.v1";
export const APP_UPDATE_RELAUNCH_FOCUS_MAX_AGE_MS = 2 * 60 * 1000;

function browserStorage(): RelaunchIntentStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function markAppUpdateRelaunchFocus(
  storage: RelaunchIntentStorage | null = browserStorage(),
  now: number = Date.now(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY, String(now));
  } catch {
    // A storage failure must not block an already installed update from restarting.
  }
}

export function clearAppUpdateRelaunchFocus(
  storage: RelaunchIntentStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY);
  } catch {
    // A failed cleanup expires by timestamp and must not break the update UI.
  }
}

export function consumeAppUpdateRelaunchFocus(
  storage: RelaunchIntentStorage | null = browserStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    const storedValue = storage.getItem(APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY);
    storage.removeItem(APP_UPDATE_RELAUNCH_FOCUS_STORAGE_KEY);
    if (storedValue === null) {
      return false;
    }
    const requestedAt = Number(storedValue);
    const age = now - requestedAt;
    return (
      Number.isFinite(requestedAt) &&
      age >= 0 &&
      age <= APP_UPDATE_RELAUNCH_FOCUS_MAX_AGE_MS
    );
  } catch {
    return false;
  }
}

export async function relaunchAppUpdateWithFocusIntent(
  relaunch: () => Promise<void>,
  storage: RelaunchIntentStorage | null = browserStorage(),
  now: number = Date.now(),
): Promise<void> {
  markAppUpdateRelaunchFocus(storage, now);
  try {
    await relaunch();
  } catch (error) {
    clearAppUpdateRelaunchFocus(storage);
    throw error;
  }
}

export async function restoreAppUpdateRelaunchFocus(
  windowHandle: RelaunchFocusWindow,
  storage: RelaunchIntentStorage | null = browserStorage(),
  now: number = Date.now(),
): Promise<boolean> {
  if (!consumeAppUpdateRelaunchFocus(storage, now)) {
    return false;
  }

  await windowHandle.show();
  await windowHandle.setFocus();
  return true;
}
