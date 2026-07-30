import { describe, expect, it } from "vitest";
import {
  APP_UPDATE_CHECK_COOLDOWN_MS,
  appUpdateActionModel,
  canCheckForAppUpdate,
  reduceAppUpdate,
  shouldRunAutomaticAppUpdateCheck,
  type AppUpdateInfo,
  type AppUpdateState,
} from "./appUpdate";

const update: AppUpdateInfo = {
  currentVersion: "0.9.1",
  version: "0.9.2",
  date: "2026-07-30T00:00:00Z",
  notes: "Fixture update",
};

describe("app update state", () => {
  it("rate-limits automatic checks while manual checks remain a caller decision", () => {
    const lastAttemptAt = 10_000;
    expect(shouldRunAutomaticAppUpdateCheck(null, lastAttemptAt)).toBe(true);
    expect(
      shouldRunAutomaticAppUpdateCheck(
        lastAttemptAt,
        lastAttemptAt + APP_UPDATE_CHECK_COOLDOWN_MS - 1,
      ),
    ).toBe(false);
    expect(
      shouldRunAutomaticAppUpdateCheck(
        lastAttemptAt,
        lastAttemptAt + APP_UPDATE_CHECK_COOLDOWN_MS,
      ),
    ).toBe(true);
  });

  it("keeps automatic no-update and check failures invisible", () => {
    const checking = reduceAppUpdate(
      { phase: "idle" },
      { type: "checkStarted", manual: false },
    );
    expect(appUpdateActionModel(checking, false)).toBeNull();
    expect(
      reduceAppUpdate(checking, { type: "checkCompleted", update: null }),
    ).toEqual({ phase: "idle" });
    expect(reduceAppUpdate(checking, { type: "checkFailed", manual: false })).toEqual({
      phase: "idle",
    });
  });

  it("shows a manual check but keeps a pending update lifecycle exclusive", () => {
    const checking: AppUpdateState = { phase: "checking", manual: true };
    expect(appUpdateActionModel(checking, false)).toMatchObject({
      label: "Checking for updates…",
      disabled: true,
    });
    expect(canCheckForAppUpdate(checking)).toBe(true);
    expect(canCheckForAppUpdate({ phase: "available", update })).toBe(false);
    expect(
      canCheckForAppUpdate({
        phase: "downloading",
        update,
        downloaded: 10,
        total: 100,
      }),
    ).toBe(false);
    expect(canCheckForAppUpdate({ phase: "ready", update })).toBe(false);
  });

  it("offers an explicit download only after discovering a newer jjcat", () => {
    const state = reduceAppUpdate(
      { phase: "checking", manual: false },
      { type: "checkCompleted", update },
    );
    expect(appUpdateActionModel(state, false)).toMatchObject({
      action: "download",
      label: "Download jjcat 0.9.2",
      disabled: false,
    });
  });

  it("reports bounded progress and reaches the restart boundary", () => {
    let state: AppUpdateState = { phase: "available", update };
    state = reduceAppUpdate(state, { type: "downloadStarted" });
    state = reduceAppUpdate(state, {
      type: "downloadProgress",
      chunkLength: 40,
      contentLength: 100,
    });
    expect(appUpdateActionModel(state, false)?.label).toBe("Downloading 40%");

    state = reduceAppUpdate(state, {
      type: "downloadProgress",
      chunkLength: 80,
    });
    expect(appUpdateActionModel(state, false)?.progress).toBe(100);

    state = reduceAppUpdate(state, { type: "downloadCompleted" });
    expect(appUpdateActionModel(state, false)).toMatchObject({
      action: "restart",
      label: "Restart to update",
    });
    expect(appUpdateActionModel(state, true)).toMatchObject({
      action: null,
      disabled: true,
      label: "Finish current operation to restart",
    });
  });

  it("makes user-visible failures retryable without exposing raw errors", () => {
    const manualFailure = reduceAppUpdate(
      { phase: "checking", manual: true },
      { type: "checkFailed", manual: true },
    );
    expect(appUpdateActionModel(manualFailure, false)).toMatchObject({
      action: "check",
      label: "Retry update check",
      title: "Couldn’t check for updates.",
    });

    const downloadFailure = reduceAppUpdate(
      { phase: "downloading", update, downloaded: 10, total: 100 },
      { type: "downloadFailed" },
    );
    expect(appUpdateActionModel(downloadFailure, false)).toMatchObject({
      action: "download",
      label: "Retry jjcat 0.9.2",
      title: "Couldn’t download the update.",
    });
    expect(canCheckForAppUpdate(downloadFailure)).toBe(false);

    const restartFailure = reduceAppUpdate(
      { phase: "ready", update },
      { type: "restartFailed" },
    );
    expect(appUpdateActionModel(restartFailure, false)).toMatchObject({
      action: "restart",
      label: "Retry restart",
      title: "Couldn’t restart jjcat.",
    });
  });
});
