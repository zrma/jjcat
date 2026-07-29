import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import type { AppUpdateInfo } from "./lib/appUpdate";

const CHECK_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MENU_CHECK_EVENT = "jjcat://check-for-updates";

export interface AppUpdater {
  check(): Promise<AppUpdateInfo | null>;
  downloadAndInstall(
    onProgress: (chunkLength: number, contentLength?: number) => void,
  ): Promise<void>;
  restart(): Promise<void>;
  onManualCheck(handler: () => void): Promise<UnlistenFn>;
}

class TauriAppUpdater implements AppUpdater {
  private pending: Update | null = null;

  async check() {
    if (this.pending) return updateInfo(this.pending);
    this.pending = await check({ timeout: CHECK_TIMEOUT_MS });
    return this.pending ? updateInfo(this.pending) : null;
  }

  async downloadAndInstall(
    onProgress: (chunkLength: number, contentLength?: number) => void,
  ) {
    if (!this.pending) throw new Error("No app update is pending.");
    let contentLength: number | undefined;
    await this.pending.downloadAndInstall(
      (event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength;
          return;
        }
        if (event.event === "Progress") {
          onProgress(event.data.chunkLength, contentLength);
        }
      },
      { timeout: DOWNLOAD_TIMEOUT_MS },
    );
  }

  restart() {
    return relaunch();
  }

  onManualCheck(handler: () => void) {
    return listen(MENU_CHECK_EVENT, handler);
  }
}

class DemoAppUpdater implements AppUpdater {
  private readonly scenario = new URLSearchParams(window.location.search).get("appUpdate");
  private update: AppUpdateInfo | null = null;

  async check() {
    if (this.scenario === "check-error") {
      throw new Error("Synthetic update check failure.");
    }
    this.update =
      this.scenario === "available" || this.scenario === "download-error"
        ? {
            currentVersion: "0.9.1",
            version: "0.9.2",
            date: "2026-07-30T00:00:00Z",
            notes: "Synthetic updater state for rendered verification.",
          }
        : null;
    return this.update;
  }

  async downloadAndInstall(
    onProgress: (chunkLength: number, contentLength?: number) => void,
  ) {
    if (!this.update) throw new Error("No synthetic update is pending.");
    for (const chunk of [18, 24, 28, 30]) {
      await delay(600);
      onProgress(chunk, 100);
      if (this.scenario === "download-error" && chunk === 24) {
        throw new Error("Synthetic updater download failure.");
      }
    }
  }

  async restart() {
    document.body.dataset.updateRestartRequested = "true";
  }

  async onManualCheck(_handler: () => void) {
    return () => undefined;
  }
}

function updateInfo(update: Update): AppUpdateInfo {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date ?? null,
    notes: update.body ?? null,
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

const isTauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const appUpdater: AppUpdater = isTauriRuntime
  ? new TauriAppUpdater()
  : new DemoAppUpdater();
