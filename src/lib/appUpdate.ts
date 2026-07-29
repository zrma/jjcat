export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
}

export type AppUpdateState =
  | { phase: "idle" }
  | { phase: "checking"; manual: boolean }
  | { phase: "available"; update: AppUpdateInfo }
  | {
      phase: "downloading";
      update: AppUpdateInfo;
      downloaded: number;
      total: number | null;
    }
  | { phase: "ready"; update: AppUpdateInfo }
  | {
      phase: "error";
      update: AppUpdateInfo | null;
      action: "check" | "download" | "restart";
      message: string;
    };

export type AppUpdateEvent =
  | { type: "checkStarted"; manual: boolean }
  | { type: "checkCompleted"; update: AppUpdateInfo | null }
  | { type: "checkFailed"; manual: boolean }
  | { type: "downloadStarted" }
  | { type: "downloadProgress"; chunkLength: number; contentLength?: number }
  | { type: "downloadCompleted" }
  | { type: "downloadFailed" }
  | { type: "restartFailed" };

export interface AppUpdateActionModel {
  label: string;
  title: string;
  disabled: boolean;
  progress: number | null;
  action: "check" | "download" | "restart" | null;
}

export function canCheckForAppUpdate(state: AppUpdateState) {
  return (
    state.phase === "idle" ||
    state.phase === "checking" ||
    (state.phase === "error" && state.action === "check")
  );
}

export function reduceAppUpdate(
  state: AppUpdateState,
  event: AppUpdateEvent,
): AppUpdateState {
  switch (event.type) {
    case "checkStarted":
      return { phase: "checking", manual: event.manual };
    case "checkCompleted":
      return event.update
        ? { phase: "available", update: event.update }
        : { phase: "idle" };
    case "checkFailed":
      return event.manual
        ? {
            phase: "error",
            update: null,
            action: "check",
            message: "Couldn’t check for updates.",
          }
        : { phase: "idle" };
    case "downloadStarted": {
      const update = updateFromState(state);
      return update
        ? {
            phase: "downloading",
            update,
            downloaded: 0,
            total: null,
          }
        : state;
    }
    case "downloadProgress":
      return state.phase === "downloading"
        ? {
            ...state,
            downloaded: state.downloaded + Math.max(0, event.chunkLength),
            total:
              event.contentLength === undefined
                ? state.total
                : Math.max(0, event.contentLength),
          }
        : state;
    case "downloadCompleted":
      return state.phase === "downloading"
        ? { phase: "ready", update: state.update }
        : state;
    case "downloadFailed": {
      const update = updateFromState(state);
      return update
        ? {
            phase: "error",
            update,
            action: "download",
            message: "Couldn’t download the update.",
          }
        : state;
    }
    case "restartFailed":
      return state.phase === "ready"
        ? {
            phase: "error",
            update: state.update,
            action: "restart",
            message: "Couldn’t restart jjcat.",
          }
        : state;
  }
}

export function appUpdateActionModel(
  state: AppUpdateState,
  restartBlocked: boolean,
): AppUpdateActionModel | null {
  switch (state.phase) {
    case "idle":
      return null;
    case "checking":
      return state.manual
        ? {
            label: "Checking for updates…",
            title: "Checking the jjcat beta update channel",
            disabled: true,
            progress: null,
            action: null,
          }
        : null;
    case "available":
      return {
        label: `Download jjcat ${state.update.version}`,
        title: `Download and verify jjcat ${state.update.version}`,
        disabled: false,
        progress: null,
        action: "download",
      };
    case "downloading": {
      const progress = downloadProgress(state.downloaded, state.total);
      return {
        label:
          progress === null
            ? `Downloading jjcat ${state.update.version}…`
            : `Downloading ${progress}%`,
        title: `Downloading and verifying jjcat ${state.update.version}`,
        disabled: true,
        progress,
        action: null,
      };
    }
    case "ready":
      return {
        label: restartBlocked ? "Finish current operation to restart" : "Restart to update",
        title: restartBlocked
          ? `jjcat ${state.update.version} is ready; finish the current operation first`
          : `Restart into jjcat ${state.update.version}`,
        disabled: restartBlocked,
        progress: 100,
        action: restartBlocked ? null : "restart",
      };
    case "error":
      return {
        label:
          state.action === "check"
            ? "Retry update check"
            : state.action === "restart"
              ? "Retry restart"
              : `Retry jjcat ${state.update?.version ?? "update"}`,
        title: state.message,
        disabled: false,
        progress: null,
        action: state.action,
      };
  }
}

function updateFromState(state: AppUpdateState) {
  switch (state.phase) {
    case "available":
    case "downloading":
    case "ready":
      return state.update;
    case "error":
      return state.update;
    case "idle":
    case "checking":
      return null;
  }
}

function downloadProgress(downloaded: number, total: number | null) {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
}
