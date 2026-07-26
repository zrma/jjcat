import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauriRuntime } from "../bridge";
import type { DiffViewMode, WhitespaceMode } from "../types";

export const DIFF_QUICK_LOOK_WINDOW_LABEL = "diff-quick-look";
export const DIFF_QUICK_LOOK_WINDOW_OPTIONS = {
  width: 1400,
  height: 900,
  minWidth: 760,
  minHeight: 480,
  center: true,
  decorations: true,
  resizable: true,
  maximizable: true,
  minimizable: true,
  closable: true,
  focus: true,
} as const;

export interface DiffQuickLookRequest {
  repositoryId: string;
  repositoryName: string;
  changeId: string;
  commitId: string;
  selectedFilePath: string;
  viewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
}

let browserQuickLookWindow: Window | null = null;

export function diffQuickLookUrl(request: DiffQuickLookRequest) {
  const params = new URLSearchParams({
    window: DIFF_QUICK_LOOK_WINDOW_LABEL,
    repositoryId: request.repositoryId,
    repositoryName: request.repositoryName,
    changeId: request.changeId,
    commitId: request.commitId,
    path: request.selectedFilePath,
    viewMode: request.viewMode,
    whitespaceMode: request.whitespaceMode,
  });
  return `index.html?${params.toString()}`;
}

export function parseDiffQuickLookRequest(
  search: string,
): DiffQuickLookRequest | null {
  const params = new URLSearchParams(search);
  if (params.get("window") !== DIFF_QUICK_LOOK_WINDOW_LABEL) return null;

  const repositoryId = params.get("repositoryId");
  const repositoryName = params.get("repositoryName");
  const changeId = params.get("changeId");
  const commitId = params.get("commitId");
  const selectedFilePath = params.get("path");
  const viewMode = params.get("viewMode");
  const whitespaceMode = params.get("whitespaceMode");

  if (
    !repositoryId ||
    !repositoryName ||
    !changeId ||
    !commitId ||
    !selectedFilePath ||
    (viewMode !== "unified" && viewMode !== "sideBySide") ||
    (whitespaceMode !== "preserve" && whitespaceMode !== "ignoreAll")
  ) {
    return null;
  }

  return {
    repositoryId,
    repositoryName,
    changeId,
    commitId,
    selectedFilePath,
    viewMode,
    whitespaceMode,
  };
}

export async function toggleDiffQuickLookWindow(
  request: DiffQuickLookRequest,
) {
  if (!isTauriRuntime) {
    if (browserQuickLookWindow && !browserQuickLookWindow.closed) {
      browserQuickLookWindow.close();
      browserQuickLookWindow = null;
      return;
    }
    const url = new URL(diffQuickLookUrl(request), window.location.href);
    browserQuickLookWindow = window.open(
      url,
      DIFF_QUICK_LOOK_WINDOW_LABEL,
      "popup,width=1400,height=900,resizable=yes,scrollbars=no",
    );
    return;
  }

  const existing = await WebviewWindow.getByLabel(
    DIFF_QUICK_LOOK_WINDOW_LABEL,
  );
  if (existing) {
    await existing.close();
    return;
  }

  const quickLook = new WebviewWindow(DIFF_QUICK_LOOK_WINDOW_LABEL, {
    url: diffQuickLookUrl(request),
    title: `${request.selectedFilePath} — ${request.repositoryName}`,
    ...DIFF_QUICK_LOOK_WINDOW_OPTIONS,
  });

  await new Promise<void>((resolve, reject) => {
    void quickLook.once("tauri://created", () => resolve());
    void quickLook.once<unknown>("tauri://error", (event) =>
      reject(new Error(String(event.payload))),
    );
  });
  await quickLook.show();
  await quickLook.setFocus();
}
