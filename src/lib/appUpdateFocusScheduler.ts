import {
  APP_UPDATE_FOCUS_DELAY_MS,
  shouldRunAutomaticAppUpdateCheck,
} from "./appUpdate";

interface AppUpdateFocusSchedulerOptions {
  getLastCheckAttemptAt: () => number | null;
  check: () => void;
  now?: () => number;
  schedule?: (handler: () => void, delay: number) => number;
  cancel?: (timer: number) => void;
}

export interface AppUpdateFocusScheduler {
  focusChanged(focused: boolean): void;
  dispose(): void;
}

export function createAppUpdateFocusScheduler({
  getLastCheckAttemptAt,
  check,
  now = Date.now,
  schedule = window.setTimeout.bind(window),
  cancel = window.clearTimeout.bind(window),
}: AppUpdateFocusSchedulerOptions): AppUpdateFocusScheduler {
  let disposed = false;
  let generation = 0;
  let timer: number | null = null;

  const clearScheduledCheck = () => {
    generation += 1;
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };

  return {
    focusChanged(focused) {
      clearScheduledCheck();
      if (
        disposed ||
        !focused ||
        !shouldRunAutomaticAppUpdateCheck(getLastCheckAttemptAt(), now())
      ) {
        return;
      }
      const scheduledGeneration = generation;
      timer = schedule(() => {
        if (disposed || scheduledGeneration !== generation) return;
        timer = null;
        if (shouldRunAutomaticAppUpdateCheck(getLastCheckAttemptAt(), now())) {
          check();
        }
      }, APP_UPDATE_FOCUS_DELAY_MS);
    },
    dispose() {
      disposed = true;
      clearScheduledCheck();
    },
  };
}
