import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  Binary,
  File,
  FileCode2,
  FileSymlink,
  Files,
  Folder,
  History,
} from "lucide-react";
import { bridge } from "../bridge";
import { canSplitChange, mutationLaunchForFileSplit, type MutationLaunch } from "../lib/changeActions";
import { pointerPopupPosition } from "../lib/popupPosition";
import { buildRevisionTree, sortedRevisionChildren, type RevisionTreeNode } from "../lib/revisionTree";
import type {
  ChangeRow,
  RevisionFileProjection,
  RevisionTreeEntry,
  RevisionTreeProjection,
} from "../types";
import { CliSpinner } from "./CliSpinner";
import { FileContextMenu } from "./FileContextMenu";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function entryIcon(entry: RevisionTreeEntry) {
  if (entry.fileType === "symlink") return <FileSymlink aria-hidden="true" />;
  if (entry.fileType === "file") return <FileCode2 aria-hidden="true" />;
  return <File aria-hidden="true" />;
}

export function RevisionFileTreePanel({
  repositoryId,
  change,
  canRevealFiles,
  onOpenDiff,
  onOpenFileInEditor,
  onRevealFile,
  onCopyFilePath,
  onOpenFileTimeline,
  onLaunchMutation,
}: {
  repositoryId: string;
  change: ChangeRow;
  canRevealFiles: boolean;
  onOpenDiff: (path: string) => void;
  onOpenFileInEditor: (path: string) => void;
  onRevealFile: (path: string) => void;
  onCopyFilePath: (path: string) => void;
  onOpenFileTimeline: (path: string) => void;
  onLaunchMutation: (launch: MutationLaunch) => void;
}) {
  const [tree, setTree] = useState<RevisionTreeProjection | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [file, setFile] = useState<RevisionFileProjection | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const fileListRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setTree(null);
    setTreeLoading(true);
    setTreeError(null);
    setSelectedPath(null);
    void bridge
      .loadRevisionTree(repositoryId, change.changeId, change.commitId)
      .then((projection) => {
        if (!active) return;
        setTree(projection);
        setSelectedPath(projection.entries[0]?.path ?? null);
      })
      .catch((error: unknown) => {
        if (active) setTreeError(errorMessage(error));
      })
      .finally(() => {
        if (active) setTreeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [change.changeId, change.commitId, repositoryId]);

  useEffect(() => {
    setFile(null);
    setFileError(null);
    if (!selectedPath) {
      setFileLoading(false);
      return;
    }
    let active = true;
    setFileLoading(true);
    void bridge
      .loadRevisionFile({
        repositoryId,
        changeId: change.changeId,
        commitId: change.commitId,
        path: selectedPath,
      })
      .then((projection) => {
        if (active) setFile(projection);
      })
      .catch((error: unknown) => {
        if (active) setFileError(errorMessage(error));
      })
      .finally(() => {
        if (active) setFileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [change.changeId, change.commitId, repositoryId, selectedPath]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const root = useMemo(() => buildRevisionTree(tree?.entries ?? []), [tree?.entries]);
  const filePaths = useMemo(
    () => tree?.entries.map((entry) => entry.path) ?? [],
    [tree?.entries],
  );
  const contextEntry = contextMenu
    ? tree?.entries.find((entry) => entry.path === contextMenu.path)
    : undefined;
  const contentLines = useMemo(() => file?.content.split("\n") ?? [], [file?.content]);
  const renderedLines = contentLines.slice(0, 20_000);
  const displayTruncated = contentLines.length > renderedLines.length;

  const openContextMenu = (path: string, x: number, y: number) => {
    setSelectedPath(path);
    const position = pointerPopupPosition({
      x,
      y,
      popupWidth: 232,
      popupHeight: 222,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setContextMenu({ path, x: position.left, y: position.top });
  };

  if (treeLoading) {
    return (
      <aside className="details-empty activity-copy" aria-live="polite">
        <CliSpinner />
        <p>Loading revision file tree…</p>
      </aside>
    );
  }
  if (treeError) {
    return (
      <aside className="details-empty detail-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <p>{treeError}</p>
      </aside>
    );
  }

  return (
    <div className="revision-file-tree-panel">
      <aside
        className="revision-file-tree-browser"
        aria-label="Revision file tree"
        data-keyboard-navigation="files"
        tabIndex={0}
        ref={fileListRef}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          if (filePaths.length === 0) return;
          event.preventDefault();
          const currentIndex = selectedPath ? filePaths.indexOf(selectedPath) : -1;
          const nextIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? filePaths.length - 1
                : event.key === "ArrowDown"
                  ? Math.min(filePaths.length - 1, Math.max(0, currentIndex + 1))
                  : Math.max(0, currentIndex < 0 ? filePaths.length - 1 : currentIndex - 1);
          const nextPath = filePaths[nextIndex];
          if (!nextPath) return;
          setSelectedPath(nextPath);
          requestAnimationFrame(() => {
            Array.from(
              fileListRef.current?.querySelectorAll<HTMLElement>("[data-file-path]") ?? [],
            )
              .find((element) => element.dataset.filePath === nextPath)
              ?.scrollIntoView({ block: "nearest" });
          });
        }}
      >
        <header>
          <Files aria-hidden="true" />
          <strong>File Tree</strong>
          <span>{tree?.entries.length ?? 0}</span>
        </header>
        {tree?.truncated ? (
          <p className="revision-file-notice">Only the bounded beginning of this tree is shown.</p>
        ) : null}
        <div className="revision-file-tree-scroll">
          {tree?.entries.length ? (
            <ul className="file-tree revision-tree">
              {sortedRevisionChildren(root).map((node) => (
                <RevisionTreeBranch
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                  onOpenContextMenu={openContextMenu}
                />
              ))}
            </ul>
          ) : (
            <p className="revision-file-notice">No tracked files in this revision.</p>
          )}
        </div>
      </aside>
      <section className="revision-source-viewer" aria-label="Revision file content">
        <header>
          <FileCode2 aria-hidden="true" />
          <strong title={selectedPath ?? undefined}>{selectedPath ?? "Select a file"}</strong>
          {selectedPath ? (
            <button type="button" onClick={() => onOpenFileTimeline(selectedPath)}>
              <History aria-hidden="true" />
              Blame
            </button>
          ) : null}
        </header>
        {fileLoading ? (
          <div className="revision-source-state" aria-live="polite">
            <CliSpinner />
            Loading file content…
          </div>
        ) : fileError ? (
          <div className="revision-source-state error" role="alert">{fileError}</div>
        ) : file?.binary ? (
          <div className="revision-source-state">
            <Binary aria-hidden="true" />
            Binary content is not rendered.
          </div>
        ) : file ? (
          <>
            {file.truncated || displayTruncated ? (
              <p className="revision-file-notice">Content was truncated at the safe display limit.</p>
            ) : null}
            <ol className="revision-source-lines">
              {renderedLines.map((line, index) => (
                <li key={index}>
                  <code>{line || " "}</code>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="revision-source-state">Select a file from the snapshot.</div>
        )}
      </section>
      {contextMenu && contextEntry ? (
        <FileContextMenu
          file={{
            path: contextEntry.path,
            status: contextEntry.status ?? "",
            displayPath: contextEntry.path,
          }}
          x={contextMenu.x}
          y={contextMenu.y}
          canReveal={canRevealFiles}
          canSplit={Boolean(contextEntry.status) && canSplitChange(change.commitId)}
          canOpenDiff={Boolean(contextEntry.status)}
          onOpenDiff={() => onOpenDiff(contextEntry.path)}
          onOpenTimeline={() => onOpenFileTimeline(contextEntry.path)}
          onOpenEditor={() => onOpenFileInEditor(contextEntry.path)}
          onReveal={() => onRevealFile(contextEntry.path)}
          onSplit={() =>
            onLaunchMutation(mutationLaunchForFileSplit(change, contextEntry.path))
          }
          onCopyPath={() => onCopyFilePath(contextEntry.path)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

function RevisionTreeBranch({
  node,
  depth,
  selectedPath,
  onSelect,
  onOpenContextMenu,
}: {
  node: RevisionTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onOpenContextMenu: (path: string, x: number, y: number) => void;
}) {
  if (node.entry) {
    const entry = node.entry;
    return (
      <li>
        <button
          type="button"
          className={`${selectedPath === entry.path ? "selected" : ""} ${entry.conflict ? "conflict" : ""}`}
          style={{ "--tree-depth": depth } as CSSProperties}
          data-file-path={entry.path}
          aria-haspopup="menu"
          onClick={() => onSelect(entry.path)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            onOpenContextMenu(entry.path, event.clientX, event.clientY);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenContextMenu(entry.path, rect.left + 24, rect.bottom + 4);
          }}
        >
          {entryIcon(entry)}
          <span title={entry.path}>{node.name}</span>
          {entry.executable ? <small>exec</small> : null}
          {entry.status ? <code>{entry.status}</code> : null}
        </button>
      </li>
    );
  }
  return (
    <li>
      <details open>
        <summary style={{ "--tree-depth": depth } as CSSProperties}>
          <Folder aria-hidden="true" />
          <span title={node.path}>{node.name}</span>
        </summary>
        <ul>
          {sortedRevisionChildren(node).map((child) => (
            <RevisionTreeBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}
