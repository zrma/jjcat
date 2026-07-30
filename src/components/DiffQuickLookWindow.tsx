import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Files } from "lucide-react";
import { bridge, isTauriRuntime } from "../bridge";
import { adjacentNavigationIndex } from "../lib/keyboardNavigation";
import type { DiffQuickLookRequest } from "../lib/diffQuickLook";
import { useDiffViewerPreferences } from "../lib/useDiffViewerPreferences";
import type { ChangeRow, FileDiffProjection } from "../types";
import { ChangedFileTree } from "./ChangeWorkspace";
import { DiffViewer } from "./DiffViewer";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

export function DiffQuickLookWindow({
  request,
}: {
  request: DiffQuickLookRequest;
}) {
  const fileListRef = useRef<HTMLElement>(null);
  const [change, setChange] = useState<ChangeRow | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState(
    request.selectedFilePath,
  );
  const { viewMode, whitespaceMode, setViewMode, setWhitespaceMode } =
    useDiffViewerPreferences(
      request.viewMode,
      request.whitespaceMode,
    );
  const [diff, setDiff] = useState<FileDiffProjection | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);

  const closeWindow = async () => {
    if (isTauriRuntime) {
      await getCurrentWebviewWindow().close();
    } else {
      window.close();
    }
  };

  useEffect(() => {
    document.title = `${selectedFilePath} — ${request.repositoryName}`;
  }, [request.repositoryName, selectedFilePath]);

  useEffect(() => {
    let active = true;
    void bridge
      .loadChangeDetails(
        request.repositoryId,
        request.changeId,
        request.commitId,
      )
      .then((details) => {
        if (!active) return;
        setChange(details);
        setSelectedFilePath((currentPath) =>
          details.files.some((file) => file.path === currentPath)
            ? currentPath
            : (details.files[0]?.path ?? ""),
        );
      })
      .catch((error: unknown) => {
        if (active) setChangeError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [request.changeId, request.commitId, request.repositoryId]);

  useEffect(() => {
    if (!selectedFilePath) return;
    let active = true;
    setDiffLoading(true);
    setDiffError(null);
    void bridge
      .loadFileDiff({
        repositoryId: request.repositoryId,
        changeId: request.changeId,
        commitId: request.commitId,
        path: selectedFilePath,
        whitespaceMode,
      })
      .then((projection) => {
        if (active) setDiff(projection);
      })
      .catch((error: unknown) => {
        if (active) setDiffError(errorMessage(error));
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    request.changeId,
    request.commitId,
    request.repositoryId,
    selectedFilePath,
    whitespaceMode,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== " " &&
        event.key !== "Spacebar" &&
        event.code !== "Space" &&
        event.key !== "Escape"
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, select, textarea, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      event.preventDefault();
      void closeWindow();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const selectedIndex = useMemo(
    () => change?.files.findIndex((file) => file.path === selectedFilePath) ?? -1,
    [change, selectedFilePath],
  );

  return (
    <main className="diff-quick-look-window">
      <header className="diff-quick-look-window-header">
        <Files aria-hidden="true" />
        <strong title={selectedFilePath}>{selectedFilePath || "File diff"}</strong>
        <span>{change?.description || change?.summary || request.repositoryName}</span>
      </header>
      {changeError ? (
        <section className="diff-quick-look-window-error" role="alert">
          {changeError}
        </section>
      ) : (
        <div className="diff-quick-look-body">
          <aside
            className="diff-quick-look-files"
            aria-label="Changed files"
            data-keyboard-navigation="files"
            tabIndex={0}
            ref={fileListRef}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              const nextIndex = adjacentNavigationIndex(
                change?.files.length ?? 0,
                selectedIndex,
                event.key === "ArrowDown" ? 1 : -1,
              );
              const nextPath = change?.files[nextIndex]?.path;
              if (!nextPath) return;
              event.preventDefault();
              event.stopPropagation();
              setSelectedFilePath(nextPath);
              window.requestAnimationFrame(() => {
                const button = Array.from(
                  fileListRef.current?.querySelectorAll<HTMLButtonElement>(
                    "button[data-file-path]",
                  ) ?? [],
                ).find((candidate) => candidate.dataset.filePath === nextPath);
                button?.focus({ preventScroll: true });
                button?.scrollIntoView({ block: "nearest" });
              });
            }}
          >
            <header>
              <Files aria-hidden="true" />
              <h2>Files ({change?.files.length ?? 0})</h2>
            </header>
            {change && (
              <ChangedFileTree
                files={change.files}
                selectedFilePath={selectedFilePath}
                onSelectFile={setSelectedFilePath}
              />
            )}
          </aside>
          <DiffViewer
            projection={diff}
            loading={diffLoading}
            error={diffError}
            viewMode={viewMode}
            whitespaceMode={whitespaceMode}
            onViewModeChange={setViewMode}
            onWhitespaceModeChange={setWhitespaceMode}
          />
        </div>
      )}
    </main>
  );
}
