import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  File,
  Files,
  Folder,
  FolderGit2,
  GitCommitHorizontal,
  History,
  Maximize2,
  UserRound,
} from "lucide-react";
import { absoluteTime, relativeTime } from "../lib/format";
import {
  changedDagLanesInRange,
  dagColumnWidth,
  dagLaneX,
  dagRowLayoutEquals,
  layoutDag,
  MAX_VISIBLE_DAG_LANES,
  type DagRowLayout,
} from "../lib/dag";
import {
  estimateRebaseTopology,
} from "../lib/rebaseTopology";
import {
  foldHistory,
  HISTORY_REVEAL_STEP,
  type HistoryFoldItem,
} from "../lib/historyFolding";
import {
  clampSplitterSize,
  splitterBounds,
  splitterSizeForKey,
  splitterSizeForPointer,
} from "../lib/splitter";
import { virtualRange } from "../lib/virtualization";
import { adjacentNavigationIndex } from "../lib/keyboardNavigation";
import type {
  ChangedFile,
  ChangeRow,
  DiffViewMode,
  FileDiffProjection,
  InspectorView,
  OperationLogProjection,
  WhitespaceMode,
} from "../types";
import { BookmarkLabels } from "./BookmarkLabels";
import { ChangeActionMenu } from "./ChangeActionMenu";
import { CliSpinner } from "./CliSpinner";
import { DiffViewer } from "./DiffViewer";
import { OperationLogPanel } from "./OperationLogPanel";
import type { MutationLaunch } from "../lib/changeActions";
import {
  historyDropLaunch,
  type HistoryDragIntent,
} from "../lib/historyDrag";
import {
  clearInspectorHeightRatio,
  loadInspectorHeightRatio,
  saveInspectorHeightRatio,
} from "../lib/preferences";

interface ChangeWorkspaceProps {
  changes: ChangeRow[];
  selectedChange?: ChangeRow;
  workingCopyMode: boolean;
  compactHistory: boolean;
  workingCopyFileCount: number;
  onSelect: (changeId: string) => void;
  refreshing: boolean;
  changeDetailsLoading: boolean;
  changeDetailsError: string | null;
  selectedFilePath: string | null;
  diff: FileDiffProjection | null;
  diffLoading: boolean;
  diffError: string | null;
  diffViewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onSelectFile: (path: string) => void;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
  onOpenDiffQuickLook: (
    change: ChangeRow,
    selectedFilePath: string,
    viewMode: DiffViewMode,
    whitespaceMode: WhitespaceMode,
  ) => void;
  inspectorView: InspectorView;
  onInspectorViewChange: (view: InspectorView) => void;
  operationLog: OperationLogProjection | null;
  operationLoading: boolean;
  operationError: string | null;
  historyStepExecuting: "undo" | "redo" | null;
  rebaseSourceCommitId: string | null;
  onRequestUndo: (operationId: string) => void;
  onRequestRedo: (operationId: string) => void;
  onLaunchMutation: (launch: MutationLaunch) => void;
}

const VIRTUALIZATION_THRESHOLD = 40;
const HISTORY_ROW_HEIGHT = 20;
const HISTORY_HEADER_HEIGHT = 21;
const HISTORY_OVERSCAN = 6;
const MIN_HISTORY_HEIGHT = 140;
const MIN_INSPECTOR_HEIGHT = 350;
const SPLITTER_SIZE = 5;
const SPLITTER_KEY_STEP = 24;

export function ChangeWorkspace({
  changes,
  selectedChange,
  workingCopyMode,
  compactHistory,
  workingCopyFileCount,
  onSelect,
  refreshing,
  changeDetailsLoading,
  changeDetailsError,
  selectedFilePath,
  diff,
  diffLoading,
  diffError,
  diffViewMode,
  whitespaceMode,
  onSelectFile,
  onDiffViewModeChange,
  onWhitespaceModeChange,
  onOpenDiffQuickLook,
  inspectorView,
  onInspectorViewChange,
  operationLog,
  operationLoading,
  operationError,
  historyStepExecuting,
  rebaseSourceCommitId,
  onRequestUndo,
  onRequestRedo,
  onLaunchMutation,
}: ChangeWorkspaceProps) {
  const contentGridRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const changeActionButtonRef = useRef<HTMLButtonElement>(null);
  const splitterBoundsRef = useRef({ min: 0, max: 0 });
  const splitterDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    contentHeight: number;
  } | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [inspectorHeightRatio, setInspectorHeightRatio] = useState<number | null>(
    () => loadInspectorHeightRatio(),
  );
  const inspectorHeightRatioRef = useRef(inspectorHeightRatio);
  const [changeActionMenu, setChangeActionMenu] = useState<{
    changeId: string;
    x: number;
    y: number;
  } | null>(null);
  const bounds = splitterBounds(
    contentHeight,
    MIN_HISTORY_HEIGHT,
    MIN_INSPECTOR_HEIGHT,
    SPLITTER_SIZE,
  );
  const currentInspectorHeight = clampSplitterSize(
    contentHeight * (inspectorHeightRatio ?? 0.4),
    bounds,
  );
  const gridStyle = contentHeight === 0
    ? undefined
    : ({ "--inspector-track": `${currentInspectorHeight}px` } as CSSProperties);
  splitterBoundsRef.current = bounds;

  const clearSplitterDrag = useCallback(() => {
    splitterDragRef.current = null;
    document.body.classList.remove("workspace-resizing");
  }, []);

  const finishSplitterDrag = useCallback(
    (pointerId: number) => {
      if (splitterDragRef.current?.pointerId !== pointerId) return;
      const ratio = inspectorHeightRatioRef.current;
      if (ratio !== null) {
        saveInspectorHeightRatio(ratio);
      }
      clearSplitterDrag();
    },
    [clearSplitterDrag],
  );

  const updateSplitterDrag = useCallback(
    (pointerId: number, clientY: number) => {
      const drag = splitterDragRef.current;
      if (!drag || drag.pointerId !== pointerId) return false;
      const nextHeight = splitterSizeForPointer(
        drag.startHeight,
        drag.startY,
        clientY,
        splitterBoundsRef.current,
      );
      const nextRatio = nextHeight / drag.contentHeight;
      inspectorHeightRatioRef.current = nextRatio;
      setInspectorHeightRatio(nextRatio);
      return true;
    },
    [],
  );

  useLayoutEffect(() => {
    const element = contentGridRef.current;
    if (!element) return;
    const updateHeight = () => setContentHeight(element.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!updateSplitterDrag(event.pointerId, event.clientY)) return;
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) =>
      finishSplitterDrag(event.pointerId);

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", clearSplitterDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", clearSplitterDrag);
      clearSplitterDrag();
    };
  }, [clearSplitterDrag, finishSplitterDrag, updateSplitterDrag]);

  useEffect(() => {
    if (!changeActionMenu) return;
    const close = () => setChangeActionMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [changeActionMenu]);

  const menuChange =
    selectedChange?.changeId === changeActionMenu?.changeId
      ? selectedChange
      : changes.find((change) => change.changeId === changeActionMenu?.changeId);

  if (workingCopyMode) {
    return (
      <WorkingCopyWorkspace
        change={selectedChange}
        fileCount={workingCopyFileCount}
        loading={changeDetailsLoading}
        error={changeDetailsError}
        selectedFilePath={selectedFilePath}
        diff={diff}
        diffLoading={diffLoading}
        diffError={diffError}
        diffViewMode={diffViewMode}
        whitespaceMode={whitespaceMode}
        onSelectFile={onSelectFile}
        onDiffViewModeChange={onDiffViewModeChange}
        onWhitespaceModeChange={onWhitespaceModeChange}
        onOpenDiffQuickLook={onOpenDiffQuickLook}
      />
    );
  }

  return (
    <div className="content-grid" ref={contentGridRef} style={gridStyle}>
      <ChangeLog
        changes={changes}
        compactHistory={compactHistory}
        selected={selectedChange?.changeId}
        onSelect={onSelect}
        refreshing={refreshing}
        rebaseSourceCommitId={rebaseSourceCommitId}
        onOpenActionMenu={(change, x, y) => {
          onSelect(change.changeId);
          setChangeActionMenu({
            changeId: change.changeId,
            x: Math.max(8, Math.min(x, window.innerWidth - 296)),
            y: Math.max(8, Math.min(y, window.innerHeight - 520)),
          });
        }}
        onLaunchMutation={onLaunchMutation}
      />
      <div
        className="workspace-splitter"
        role="separator"
        aria-label="Resize change inspector"
        aria-orientation="horizontal"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={currentInspectorHeight}
        tabIndex={0}
        title="Drag to resize · Double-click to reset"
        onDoubleClick={() => {
          inspectorHeightRatioRef.current = null;
          setInspectorHeightRatio(null);
          clearInspectorHeightRatio();
        }}
        onKeyDown={(event) => {
          const next = splitterSizeForKey(
            event.key,
            currentInspectorHeight,
            bounds,
            SPLITTER_KEY_STEP,
          );
          if (next === null) return;
          event.preventDefault();
          if (contentHeight > 0) {
            const nextRatio = next / contentHeight;
            inspectorHeightRatioRef.current = nextRatio;
            setInspectorHeightRatio(nextRatio);
            saveInspectorHeightRatio(nextRatio);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const measuredContentHeight =
            contentGridRef.current?.getBoundingClientRect().height ??
            contentHeight;
          if (measuredContentHeight <= 0) return;
          const measuredBounds = splitterBounds(
            measuredContentHeight,
            MIN_HISTORY_HEIGHT,
            MIN_INSPECTOR_HEIGHT,
            SPLITTER_SIZE,
          );
          const measuredHeight =
            inspectorRef.current?.getBoundingClientRect().height ??
            currentInspectorHeight;
          splitterBoundsRef.current = measuredBounds;
          splitterDragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: clampSplitterSize(measuredHeight, measuredBounds),
            contentHeight: measuredContentHeight,
          };
          if (measuredContentHeight !== contentHeight) {
            setContentHeight(measuredContentHeight);
          }
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Window-level tracking remains available when WebKit rejects capture.
          }
          document.body.classList.add("workspace-resizing");
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (!updateSplitterDrag(event.pointerId, event.clientY)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          finishSplitterDrag(event.pointerId);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => finishSplitterDrag(event.pointerId)}
        onLostPointerCapture={(event) => finishSplitterDrag(event.pointerId)}
      />
      <section
        className="inspector-shell"
        aria-label="Change inspector"
        ref={inspectorRef}
      >
        <nav className="inspector-tabs" aria-label="Inspector views">
          <button
            type="button"
            className={`inspector-changes-tab ${
              inspectorView === "changes" ? "selected" : ""
            }`}
            onClick={() => onInspectorViewChange("changes")}
          >
            <Files aria-hidden="true" />
            Changes
            <span>{selectedChange?.files.length ?? 0}</span>
          </button>
          <button
            type="button"
            className={inspectorView === "operations" ? "selected" : ""}
            onClick={() => onInspectorViewChange("operations")}
          >
            <History aria-hidden="true" />
            Operations
          </button>
          <span className="inspector-tab-spacer" />
          <button
            type="button"
            ref={changeActionButtonRef}
            className={`change-action-trigger ${changeActionMenu ? "open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={Boolean(changeActionMenu)}
            disabled={!selectedChange || inspectorView === "operations"}
            onClick={() => {
              if (changeActionMenu) {
                setChangeActionMenu(null);
                return;
              }
              const rect = changeActionButtonRef.current?.getBoundingClientRect();
              if (!rect || !selectedChange) return;
              setChangeActionMenu({
                changeId: selectedChange.changeId,
                x: Math.max(8, Math.min(rect.right - 286, window.innerWidth - 296)),
                y: Math.max(
                  8,
                  Math.min(rect.bottom + 4, window.innerHeight - 456),
                ),
              });
            }}
          >
            <GitCommitHorizontal aria-hidden="true" />
            Change
            <ChevronDown aria-hidden="true" />
          </button>
        </nav>
        <div
          className="inspector-panel"
          aria-busy={inspectorView !== "operations" && changeDetailsLoading}
        >
          {inspectorView !== "operations" && changeDetailsLoading && (
            <span className="sr-only" role="status">
              Loading selected change details
            </span>
          )}
          {inspectorView === "operations" ? (
            <OperationLogPanel
              projection={operationLog}
              loading={operationLoading}
              error={operationError}
              executing={historyStepExecuting}
              onClose={() => onInspectorViewChange("changes")}
              onRequestUndo={onRequestUndo}
              onRequestRedo={onRequestRedo}
            />
          ) : changeDetailsError ? (
            <aside className="details-empty detail-error" role="alert">
              <FolderGit2 aria-hidden="true" />
              <p>{changeDetailsError}</p>
            </aside>
          ) : (
            <ChangeInspector
              change={selectedChange}
              selectedFilePath={selectedFilePath}
              diff={diff}
              diffLoading={diffLoading}
              diffError={diffError}
              diffViewMode={diffViewMode}
              whitespaceMode={whitespaceMode}
              onSelectFile={onSelectFile}
              onDiffViewModeChange={onDiffViewModeChange}
              onWhitespaceModeChange={onWhitespaceModeChange}
              onOpenDiffQuickLook={onOpenDiffQuickLook}
            />
          )}
        </div>
      </section>
      {changeActionMenu && menuChange && (
        <ChangeActionMenu
          change={menuChange}
          changes={changes}
          x={changeActionMenu.x}
          y={changeActionMenu.y}
          onClose={() => setChangeActionMenu(null)}
          onLaunch={onLaunchMutation}
        />
      )}
    </div>
  );
}

function WorkingCopyWorkspace({
  change,
  fileCount,
  loading,
  error,
  selectedFilePath,
  diff,
  diffLoading,
  diffError,
  diffViewMode,
  whitespaceMode,
  onSelectFile,
  onDiffViewModeChange,
  onWhitespaceModeChange,
  onOpenDiffQuickLook,
}: {
  change?: ChangeRow;
  fileCount: number;
  loading: boolean;
  error: string | null;
  selectedFilePath: string | null;
  diff: FileDiffProjection | null;
  diffLoading: boolean;
  diffError: string | null;
  diffViewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onSelectFile: (path: string) => void;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
  onOpenDiffQuickLook: (
    change: ChangeRow,
    selectedFilePath: string,
    viewMode: DiffViewMode,
    whitespaceMode: WhitespaceMode,
  ) => void;
}) {
  return (
    <section className="working-copy-workspace" aria-label="Working copy files">
      <header className="working-copy-heading">
        <FolderGit2 aria-hidden="true" />
        <strong>Working Copy</strong>
        <span>
          {fileCount} {fileCount === 1 ? "file" : "files"}
        </span>
        {change && (
          <small title={change.summary || "(no description)"}>
            {change.summary || "(no description)"}
          </small>
        )}
      </header>
      <div className="working-copy-content">
        {loading ? (
          <aside className="details-empty activity-copy" aria-live="polite">
            <CliSpinner />
            <p>Loading working copy files…</p>
          </aside>
        ) : error ? (
          <aside className="details-empty detail-error" role="alert">
            <FolderGit2 aria-hidden="true" />
            <p>{error}</p>
          </aside>
        ) : (
          <ChangeFiles
            change={change}
            selectedFilePath={selectedFilePath}
            diff={diff}
            diffLoading={diffLoading}
            diffError={diffError}
            diffViewMode={diffViewMode}
            whitespaceMode={whitespaceMode}
            onSelectFile={onSelectFile}
            onDiffViewModeChange={onDiffViewModeChange}
            onWhitespaceModeChange={onWhitespaceModeChange}
            onOpenDiffQuickLook={onOpenDiffQuickLook}
          />
        )}
      </div>
    </section>
  );
}

function ChangeLog({
  changes,
  compactHistory,
  selected,
  onSelect,
  refreshing,
  rebaseSourceCommitId,
  onOpenActionMenu,
  onLaunchMutation,
}: {
  changes: ChangeRow[];
  compactHistory: boolean;
  selected?: string;
  onSelect: (changeId: string) => void;
  refreshing: boolean;
  rebaseSourceCommitId: string | null;
  onOpenActionMenu: (change: ChangeRow, x: number, y: number) => void;
  onLaunchMutation: (launch: MutationLaunch) => void;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ height: 600, scrollTop: 0 });
  const [revealedByGap, setRevealedByGap] = useState<Record<string, number>>({});
  const historyIdentity = `${changes[0]?.commitId ?? ""}:${changes.at(-1)?.commitId ?? ""}:${changes.length}`;
  const foldItems = useMemo(
    () =>
      foldHistory(
        changes,
        selected,
        revealedByGap,
        compactHistory,
        [],
      ),
    [changes, compactHistory, revealedByGap, selected],
  );
  const virtualized = foldItems.length >= VIRTUALIZATION_THRESHOLD;
  const dag = useMemo(() => layoutDag(changes), [changes]);
  const visibleLaneCount = Math.min(
    dag.maxLaneCount,
    MAX_VISIBLE_DAG_LANES,
  );
  const dagWidth = dagColumnWidth(visibleLaneCount);
  const graphStyle = {
    "--dag-width": `${dagWidth}px`,
    "--dag-lane-origin": `${dagLaneX(0)}px`,
  } as CSSProperties;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateHeight = () =>
      setViewport((current) => ({
        ...current,
        height: Math.max(0, element.clientHeight - HISTORY_HEADER_HEIGHT),
      }));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = 0;
    setViewport((current) => ({ ...current, scrollTop: 0 }));
    setRevealedByGap({});
  }, [historyIdentity]);

  useEffect(() => {
    const index = foldItems.findIndex(
      (item) => item.kind === "change" && item.change.changeId === selected,
    );
    const element = scrollRef.current;
    if (!element || index < 0) return;
    const rowTop = HISTORY_HEADER_HEIGHT + index * HISTORY_ROW_HEIGHT;
    const rowBottom = rowTop + HISTORY_ROW_HEIGHT;
    if (rowTop < element.scrollTop + HISTORY_HEADER_HEIGHT) {
      element.scrollTop = Math.max(0, rowTop - HISTORY_HEADER_HEIGHT);
    } else if (rowBottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = rowBottom - element.clientHeight;
    }
  }, [foldItems, selected]);

  if (changes.length === 0) {
    return (
      <section className="change-log empty-log">
        {refreshing ? <CliSpinner /> : <FolderGit2 aria-hidden="true" />}
        <h2>No matching changes</h2>
        <p>
          {refreshing
            ? "Reading the repository…"
            : "Refresh the repository or change the current history filter."}
        </p>
      </section>
    );
  }

  return (
    <section
      className="change-log"
      aria-label="Change history"
      aria-rowcount={foldItems.length}
      data-keyboard-navigation="graph"
      tabIndex={-1}
      ref={scrollRef}
      style={graphStyle}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            ".change-row, button, input, select, textarea, summary, a",
          )
        ) {
          return;
        }
        event.currentTarget.focus({ preventScroll: true });
      }}
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        setViewport((current) => ({ ...current, scrollTop }));
      }}
    >
      <div className="log-header" aria-hidden="true">
        <span className="col-graph" />
        <span className="col-change">Change</span>
        <span className="col-refs">Refs</span>
        <span className="col-description">Description</span>
        <span className="col-author">Author</span>
        <span className="col-commit">Commit</span>
        <span className="col-updated">Updated</span>
      </div>
      <ChangeRows
        changes={changes}
        items={foldItems}
        dagRows={dag.rows}
        dagWidth={dagWidth}
        selected={selected}
        onSelect={onSelect}
        virtualized={virtualized}
        viewportHeight={viewport.height}
        scrollTop={viewport.scrollTop}
        scrollContainerRef={scrollRef}
        rebaseSourceCommitId={rebaseSourceCommitId}
        onOpenActionMenu={onOpenActionMenu}
        onLaunchMutation={onLaunchMutation}
        onRevealGap={(id, count) =>
          setRevealedByGap((current) => ({ ...current, [id]: count }))
        }
      />
    </section>
  );
}

function ChangeRows({
  changes,
  items,
  dagRows,
  dagWidth,
  selected,
  onSelect,
  virtualized,
  viewportHeight,
  scrollTop,
  scrollContainerRef,
  rebaseSourceCommitId,
  onOpenActionMenu,
  onLaunchMutation,
  onRevealGap,
}: {
  changes: ChangeRow[];
  items: HistoryFoldItem[];
  dagRows: DagRowLayout[];
  dagWidth: number;
  selected?: string;
  onSelect: (changeId: string) => void;
  virtualized: boolean;
  viewportHeight: number;
  scrollTop: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  rebaseSourceCommitId: string | null;
  onOpenActionMenu: (change: ChangeRow, x: number, y: number) => void;
  onLaunchMutation: (launch: MutationLaunch) => void;
  onRevealGap: (id: string, count: number) => void;
}) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<HistoryDragIntent | null>(null);
  const pointerDragRef = useRef<{
    intent: HistoryDragIntent;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const previewSourceCommitId =
    activeDrag?.kind === "rebase" ? activeDrag.sourceCommitId : null;
  const previewDestinationCommitId = dropTarget;
  const hoverTopologyPreview = useMemo(
    () =>
      estimateRebaseTopology(
        changes,
        previewSourceCommitId,
        previewDestinationCommitId,
      ),
    [changes, previewDestinationCommitId, previewSourceCommitId],
  );
  const hoverDagRows = useMemo(
    () =>
      hoverTopologyPreview
        ? layoutDag(hoverTopologyPreview.changes).rows
        : null,
    [hoverTopologyPreview],
  );
  const previewFoldLanesById = useMemo(() => {
    if (!hoverDagRows) return new Map<string, number[]>();

    return new Map(
      items.flatMap((item) => {
        if (item.kind !== "fold") return [];
        const lanes = changedDagLanesInRange(
          dagRows,
          hoverDagRows,
          item.startIndex + item.shownCount,
          item.endIndex + 1,
        );
        return lanes.length > 0 ? [[item.id, lanes] as const] : [];
      }),
    );
  }, [dagRows, hoverDagRows, items]);
  const commitAtPoint = (clientX: number, clientY: number) =>
    document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLButtonElement>(".change-row")
      ?.dataset.commitId ?? null;

  const beginPointerDrag = (
    intent: HistoryDragIntent,
    clientX: number,
    clientY: number,
  ) => {
    if (pointerDragRef.current) return;
    pointerDragRef.current = {
      intent,
      startX: clientX,
      startY: clientY,
      active: false,
    };
  };

  const updatePointerDrag = (clientX: number, clientY: number) => {
    const drag = pointerDragRef.current;
    if (!drag) return false;
    if (
      !drag.active &&
      Math.hypot(clientX - drag.startX, clientY - drag.startY) < 5
    ) {
      return false;
    }
    drag.active = true;
    setActiveDrag(drag.intent);
    const scrollElement = scrollContainerRef.current;
    if (scrollElement) {
      const bounds = scrollElement.getBoundingClientRect();
      const edgeSize = 44;
      const distanceFromTop = clientY - bounds.top;
      const distanceFromBottom = bounds.bottom - clientY;
      if (distanceFromTop < edgeSize) {
        scrollElement.scrollTop -= Math.ceil((edgeSize - distanceFromTop) / 4);
      } else if (distanceFromBottom < edgeSize) {
        scrollElement.scrollTop += Math.ceil((edgeSize - distanceFromBottom) / 4);
      }
    }
    const destinationCommitId = commitAtPoint(clientX, clientY);
    setDropTarget(
      destinationCommitId &&
        historyDropLaunch(changes, drag.intent, destinationCommitId)
        ? destinationCommitId
        : null,
    );
    return true;
  };

  const finishPointerDrag = (
    clientX: number,
    clientY: number,
    cancelled = false,
  ) => {
    const drag = pointerDragRef.current;
    if (!drag) return false;

    const destinationCommitId = cancelled
      ? null
      : commitAtPoint(clientX, clientY);
    pointerDragRef.current = null;
    setDropTarget(null);
    setActiveDrag(null);

    if (drag.active) suppressClickRef.current = true;
    const launch =
      drag.active && destinationCommitId
        ? historyDropLaunch(changes, drag.intent, destinationCommitId)
        : null;
    if (launch) {
      onLaunchMutation(launch);
    }
    return drag.active;
  };

  const range = virtualized
    ? virtualRange(
        items.length,
        HISTORY_ROW_HEIGHT,
        viewportHeight,
        scrollTop,
        HISTORY_OVERSCAN,
      )
    : {
        startIndex: 0,
        endIndex: items.length,
        offsetTop: 0,
        totalHeight: items.length * HISTORY_ROW_HEIGHT,
      };
  const visibleItems = items.slice(range.startIndex, range.endIndex);

  return (
    <div
      className={`log-body ${virtualized ? "virtualized" : ""}`}
      style={virtualized ? { height: range.totalHeight } : undefined}
      data-rendered-rows={visibleItems.length}
    >
      {visibleItems.map((item, visibleIndex) => {
        const displayIndex = range.startIndex + visibleIndex;
        if (item.kind === "fold") {
          return (
            <HistoryFoldRow
              fold={item}
              virtualized={virtualized}
              displayIndex={displayIndex}
              dagWidth={dagWidth}
              previewLanes={previewFoldLanesById.get(item.id)}
              onReveal={onRevealGap}
              key={`fold-${item.id}`}
            />
          );
        }
        const { change, sourceIndex } = item;
        const bookmarkDrag =
          activeDrag?.kind === "bookmarkMove" ? activeDrag : null;
        const isBookmarkDropTarget =
          bookmarkDrag !== null && change.commitId === dropTarget;
        return (
          <div
            role="row"
            tabIndex={0}
            className={`change-row ${virtualized ? "virtualized-row" : ""} ${change.changeId === selected ? "selected" : ""} ${change.commitId === rebaseSourceCommitId ? "rebase-source" : ""} ${change.commitId === previewSourceCommitId ? "rebase-preview-source" : ""} ${activeDrag?.kind !== "bookmarkMove" && change.commitId === previewDestinationCommitId ? "rebase-drop-target" : ""} ${isBookmarkDropTarget ? "bookmark-drop-target" : ""}`}
            style={virtualized ? { top: displayIndex * HISTORY_ROW_HEIGHT } : undefined}
            aria-posinset={displayIndex + 1}
            aria-setsize={items.length}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect(change.changeId);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(change.changeId);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenActionMenu(
                change,
                event.clientX || rect.left + 24,
                event.clientY || rect.top + 16,
              );
            }}
            data-commit-id={change.commitId}
            aria-grabbed={
              change.commitId === rebaseSourceCommitId ||
              (activeDrag?.kind === "rebase" &&
                change.commitId === activeDrag.sourceCommitId)
            }
            title="Drag this change onto another change to preview a rebase"
            onPointerDown={(event) => {
              const target = event.target;
              if (
                !(
                  target instanceof Element &&
                  target.closest("button, input, select, textarea, summary, a")
                )
              ) {
                event.currentTarget.focus({ preventScroll: true });
              }
              if (
                event.button !== 0 ||
                /^0+$/.test(change.commitId) ||
                event.pointerType === "touch"
              ) {
                return;
              }
              beginPointerDrag(
                { kind: "rebase", sourceCommitId: change.commitId },
                event.clientX,
                event.clientY,
              );
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (updatePointerDrag(event.clientX, event.clientY)) {
                event.preventDefault();
              }
            }}
            onPointerUp={(event) => {
              if (finishPointerDrag(event.clientX, event.clientY)) {
                event.preventDefault();
                event.stopPropagation();
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (finishPointerDrag(event.clientX, event.clientY, true)) {
                event.preventDefault();
                event.stopPropagation();
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            key={`${change.changeId}-${change.commitId}`}
          >
            <DagCell
              change={change}
              layout={
                hoverDagRows?.[sourceIndex] ??
                dagRows[sourceIndex]
              }
              previousLayout={
                hoverDagRows?.[sourceIndex]
                  ? dagRows[sourceIndex]
                  : undefined
              }
              width={dagWidth}
              moving={change.commitId === previewSourceCommitId}
            />
            <code className="change-id">{change.changeId}</code>
            <span className="change-refs">
              <BookmarkLabels
                bookmarks={change.bookmarks}
                limit={2}
                localBookmarkDrag={{
                  activeName:
                    bookmarkDrag?.sourceCommitId === change.commitId
                      ? bookmarkDrag.name
                      : null,
                  onPointerDown: (bookmark, event) => {
                    if (event.button !== 0 || event.pointerType === "touch") {
                      return;
                    }
                    event.stopPropagation();
                    beginPointerDrag(
                      {
                        kind: "bookmarkMove",
                        name: bookmark.name,
                        sourceCommitId: change.commitId,
                      },
                      event.clientX,
                      event.clientY,
                    );
                    event.currentTarget.setPointerCapture(event.pointerId);
                  },
                  onPointerMove: (event) => {
                    event.stopPropagation();
                    if (updatePointerDrag(event.clientX, event.clientY)) {
                      event.preventDefault();
                    }
                  },
                  onPointerUp: (event) => {
                    event.stopPropagation();
                    if (finishPointerDrag(event.clientX, event.clientY)) {
                      event.preventDefault();
                    }
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                  },
                  onPointerCancel: (event) => {
                    event.stopPropagation();
                    if (
                      finishPointerDrag(
                        event.clientX,
                        event.clientY,
                        true,
                      )
                    ) {
                      event.preventDefault();
                    }
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                  },
                }}
              />
            </span>
            <span className="change-description">
              <span className="change-summary">{change.summary || "(no description)"}</span>
              {change.workingCopy && <strong>Working Copy</strong>}
              {!change.workingCopy && (change.workspaceCopies?.length ?? 0) > 0 && (
                <strong
                  className="workspace-copy-label"
                  title={`Working copy for ${change.workspaceCopies?.join(", ")}`}
                >
                  Workspace · {change.workspaceCopies?.join(", ")}
                </strong>
              )}
              {change.conflict && <strong className="conflict-label">Conflict</strong>}
              {change.commitId === previewSourceCommitId && (
                <strong className="rebase-position-label">Moving</strong>
              )}
              {change.commitId === previewDestinationCommitId && (
                <strong className="rebase-parent-label">New parent</strong>
              )}
              {isBookmarkDropTarget && (
                <strong className="bookmark-target-label">
                  Move {bookmarkDrag.name} here
                </strong>
              )}
            </span>
            <span className="change-author">{change.author || "—"}</span>
            <code className="change-commit col-commit">{change.commitId}</code>
            <span className="change-updated">{relativeTime(change.updatedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryFoldRow({
  fold,
  virtualized,
  displayIndex,
  dagWidth,
  previewLanes,
  onReveal,
}: {
  fold: Extract<HistoryFoldItem, { kind: "fold" }>;
  virtualized: boolean;
  displayIndex: number;
  dagWidth: number;
  previewLanes?: readonly number[];
  onReveal: (id: string, count: number) => void;
}) {
  const revealCount = Math.min(
    fold.totalCount,
    fold.shownCount + HISTORY_REVEAL_STEP,
  );
  return (
    <div
      className={`history-fold-row ${virtualized ? "virtualized-row" : ""} ${previewLanes?.length ? "previewing" : ""}`}
      style={virtualized ? { top: displayIndex * HISTORY_ROW_HEIGHT } : undefined}
      role="row"
      aria-label={
        fold.hiddenCount > 0
          ? `${fold.hiddenCount} changes hidden`
          : `${fold.totalCount} changes expanded`
      }
    >
      <span className="history-fold-graph" style={{ width: dagWidth }}>
        {previewLanes && previewLanes.length > 0 && (
          <svg
            className="history-fold-preview"
            viewBox={`0 0 ${dagWidth} 20`}
            preserveAspectRatio="xMinYMid meet"
            aria-hidden="true"
          >
            {previewLanes.map((lane) => (
              <path d={`M${laneX(lane)} 0V20`} key={lane} />
            ))}
          </svg>
        )}
        <i aria-hidden="true">~</i>
      </span>
      <span className="history-fold-summary">
        <span>
          {fold.hiddenCount > 0
            ? `${fold.hiddenCount} changes hidden`
            : `${fold.totalCount} changes expanded`}
          {fold.shownCount > 0 &&
            fold.hiddenCount > 0 &&
            ` · ${fold.shownCount} shown`}
        </span>
        <span className="history-fold-actions">
          {fold.hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => onReveal(fold.id, revealCount)}
              title={`Show up to ${HISTORY_REVEAL_STEP} more changes`}
            >
              <ChevronsDown aria-hidden="true" />
              Show {Math.min(HISTORY_REVEAL_STEP, fold.hiddenCount)} more
            </button>
          )}
          {fold.hiddenCount > HISTORY_REVEAL_STEP && (
            <button
              type="button"
              onClick={() => onReveal(fold.id, fold.totalCount)}
            >
              Show all
            </button>
          )}
          {fold.shownCount > 0 && (
            <button
              type="button"
              onClick={() => onReveal(fold.id, 0)}
              title="Collapse this history section"
            >
              <ChevronsUp aria-hidden="true" />
              Collapse
            </button>
          )}
        </span>
      </span>
    </div>
  );
}

function laneX(lane: number) {
  return dagLaneX(lane);
}

function DagCell({
  change,
  layout,
  previousLayout,
  width,
  moving = false,
}: {
  change: ChangeRow;
  layout: DagRowLayout;
  previousLayout?: DagRowLayout;
  width: number;
  moving?: boolean;
}) {
  const comparing =
    previousLayout !== undefined &&
    !dagRowLayoutEquals(previousLayout, layout);

  return (
    <span
      className={`dag-cell ${comparing ? "comparing" : ""} ${moving ? "moving" : ""}`}
      aria-hidden="true"
      data-lane={layout.lane}
      data-lane-overflow={layout.lane >= MAX_VISIBLE_DAG_LANES ? "true" : undefined}
    >
      {comparing && previousLayout ? (
        <>
          <DagSvg
            change={change}
            layout={previousLayout}
            width={width}
            className="dag-layer previous"
          />
          <DagSvg
            change={change}
            layout={layout}
            width={width}
            className={`dag-layer proposed ${moving ? "moving" : ""}`}
          />
        </>
      ) : (
        <DagSvg
          change={change}
          layout={layout}
          width={width}
          className={moving ? "dag-layer proposed moving" : undefined}
        />
      )}
    </span>
  );
}

function DagSvg({
  change,
  layout,
  width,
  className,
}: {
  change: ChangeRow;
  layout: DagRowLayout;
  width: number;
  className?: string;
}) {
  const isRoot = /^0+$/.test(change.commitId);
  const isWorkspaceCopy = (change.workspaceCopies?.length ?? 0) > 0;
  const nodeX = laneX(layout.lane);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} 20`}
      preserveAspectRatio="xMinYMid meet"
    >
      {layout.hasIncoming && (
        <path
          className={`lane-${layout.lane % 6} ${isWorkspaceCopy ? "workspace-line" : ""} ${change.workingCopy ? "working-line" : ""}`}
          d={`M${nodeX} 0V10`}
        />
      )}
      {layout.edges.map((edge, index) => {
        const fromX = laneX(edge.fromLane);
        const toX = laneX(edge.toLane);
        const startY = edge.kind === "parent" ? 10 : 0;
        return (
          <path
            className={`edge-${edge.kind} lane-${edge.fromLane % 6} ${isWorkspaceCopy ? "workspace-line" : ""} ${change.workingCopy ? "working-line" : ""} ${edge.kind === "parent" && (edge.parentIndex ?? 0) > 0 ? "branch-line" : ""}`}
            d={`M${fromX} ${startY} C${fromX} 14 ${toX} 15 ${toX} 20`}
            key={`${edge.kind}-${edge.fromLane}-${edge.toLane}-${index}`}
          />
        );
      })}
      <circle
        className={`lane-${layout.lane % 6} ${isWorkspaceCopy ? "workspace-node" : ""} ${change.workingCopy ? "working-node" : ""} ${change.bookmarks.length > 0 ? "bookmark-node" : ""} ${isRoot ? "root-node" : ""}`}
        cx={nodeX}
        cy="10"
        r={change.workingCopy ? "4.5" : "3.5"}
      />
    </svg>
  );
}

function ChangeInspector({
  change,
  selectedFilePath,
  diff,
  diffLoading,
  diffError,
  diffViewMode,
  whitespaceMode,
  onSelectFile,
  onDiffViewModeChange,
  onWhitespaceModeChange,
  onOpenDiffQuickLook,
}: {
  change?: ChangeRow;
  selectedFilePath: string | null;
  diff: FileDiffProjection | null;
  diffLoading: boolean;
  diffError: string | null;
  diffViewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onSelectFile: (path: string) => void;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
  onOpenDiffQuickLook: (
    change: ChangeRow,
    selectedFilePath: string,
    viewMode: DiffViewMode,
    whitespaceMode: WhitespaceMode,
  ) => void;
}) {
  return (
    <div className="change-inspector">
      <ChangeOverview change={change} />
      <ChangeFiles
        change={change}
        selectedFilePath={selectedFilePath}
        diff={diff}
        diffLoading={diffLoading}
        diffError={diffError}
        diffViewMode={diffViewMode}
        whitespaceMode={whitespaceMode}
        onSelectFile={onSelectFile}
        onDiffViewModeChange={onDiffViewModeChange}
        onWhitespaceModeChange={onWhitespaceModeChange}
        onOpenDiffQuickLook={onOpenDiffQuickLook}
      />
    </div>
  );
}

function ChangeOverview({ change }: { change?: ChangeRow }) {
  if (!change) {
    return (
      <aside className="change-overview details-empty">
        <FolderGit2 aria-hidden="true" />
        <p>Select a change to inspect its summary and metadata.</p>
      </aside>
    );
  }

  const description = (
    change.description ||
    change.summary ||
    "(no description)"
  ).trimEnd();
  const [subject, ...messageLines] = description.split("\n");
  const messageBody = messageLines.join("\n").replace(/^\n/, "");
  const authorTimestamp = change.authorTimestamp || change.updatedAt;
  const committerTimestamp = change.committerTimestamp || change.updatedAt;

  return (
    <aside className="change-overview" aria-label="Selected change overview">
      <div className="overview-main">
        <section className="commit-message" aria-label="Full commit message">
          <header>
            <span>Commit message</span>
            {(change.workingCopy || change.conflict || change.empty) && (
              <span className="commit-state" aria-label="Change state">
                {change.workingCopy && <span className="working">Working copy</span>}
                {change.conflict && <span className="conflict">Conflicted</span>}
                {change.empty && <span>Empty change</span>}
              </span>
            )}
          </header>
          <h2>{subject || "(no description)"}</h2>
          {messageBody && <pre>{messageBody}</pre>}
        </section>
        <div className="overview-summary-grid">
          <section className="identity-stack" aria-label="Commit identities">
            <Identity
              label="Author"
              icon={<UserRound aria-hidden="true" />}
              name={change.author || "Unknown author"}
              email={change.authorEmail}
              timestamp={authorTimestamp}
            />
            <Identity
              label="Committer"
              icon={<GitCommitHorizontal aria-hidden="true" />}
              name={change.committer || change.author || "Unknown committer"}
              email={change.committerEmail}
              timestamp={committerTimestamp}
            />
          </section>
          <section className="commit-facts" aria-label="Commit references">
            <Detail
              label="Refs"
              value={<BookmarkLabels bookmarks={change.bookmarks} emptyLabel="—" />}
            />
            <Detail label="Change ID" value={change.changeId} mono />
            <Detail label="Commit SHA" value={change.commitId} mono />
            <Detail
              label="Parents"
              value={
                <ParentReferences
                  changeIds={change.parents}
                  commitIds={change.parentCommitIds ?? []}
                />
              }
            />
          </section>
        </div>
      </div>
    </aside>
  );
}

function ChangeFiles({
  change,
  selectedFilePath,
  diff,
  diffLoading,
  diffError,
  diffViewMode,
  whitespaceMode,
  onSelectFile,
  onDiffViewModeChange,
  onWhitespaceModeChange,
  onOpenDiffQuickLook,
}: {
  change?: ChangeRow;
  selectedFilePath: string | null;
  diff: FileDiffProjection | null;
  diffLoading: boolean;
  diffError: string | null;
  diffViewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onSelectFile: (path: string) => void;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
  onOpenDiffQuickLook: (
    change: ChangeRow,
    selectedFilePath: string,
    viewMode: DiffViewMode,
    whitespaceMode: WhitespaceMode,
  ) => void;
}) {
  const fileListRef = useRef<HTMLElement>(null);

  if (!change) {
    return (
      <aside className="change-details details-empty">
        <FolderGit2 aria-hidden="true" />
        <p>Select a change to inspect its changed files.</p>
      </aside>
    );
  }

  return (
    <aside className="change-details" aria-label="Selected change details">
      <section
        className="detail-files"
        data-keyboard-navigation="files"
        tabIndex={0}
        ref={fileListRef}
        onPointerDown={(event) => {
          const target = event.target;
          const fileButton =
            target instanceof Element
              ? target.closest<HTMLButtonElement>("button[data-file-path]")
              : null;
          if (fileButton) {
            fileButton.focus({ preventScroll: true });
            return;
          }
          if (
            target instanceof Element &&
            target.closest("button, input, select, textarea, summary, a")
          ) {
            return;
          }
          event.currentTarget.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (
            event.key === " " ||
            event.key === "Spacebar" ||
            event.code === "Space"
          ) {
            if (!selectedFilePath) return;
            event.preventDefault();
            event.stopPropagation();
            onOpenDiffQuickLook(
              change,
              selectedFilePath,
              diffViewMode,
              whitespaceMode,
            );
            return;
          }
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button[data-file-path]",
            ),
          ).filter((button) => button.getClientRects().length > 0);
          const focusedButton =
            document.activeElement instanceof Element
              ? document.activeElement.closest<HTMLButtonElement>(
                  "button[data-file-path]",
                )
              : null;
          const currentIndex = focusedButton
            ? buttons.indexOf(focusedButton)
            : buttons.findIndex(
                (button) => button.dataset.filePath === selectedFilePath,
              );
          const nextIndex = adjacentNavigationIndex(
            buttons.length,
            currentIndex,
            event.key === "ArrowDown" ? 1 : -1,
          );
          const nextButton = buttons[nextIndex];
          const nextPath = nextButton?.dataset.filePath;
          if (!nextButton || !nextPath) return;
          event.preventDefault();
          event.stopPropagation();
          if (nextIndex === currentIndex) return;
          onSelectFile(nextPath);
          nextButton.focus({ preventScroll: true });
          nextButton.scrollIntoView({ block: "nearest" });
        }}
      >
        <header>
          <Files aria-hidden="true" />
          <h2>Files ({change.files.length})</h2>
          <button
            type="button"
            className="quick-look-trigger"
            disabled={!selectedFilePath}
            onClick={() => {
              if (!selectedFilePath) return;
              onOpenDiffQuickLook(
                change,
                selectedFilePath,
                diffViewMode,
                whitespaceMode,
              );
            }}
            title="Open diff Quick Look (Space)"
            aria-label="Open selected file diff in Quick Look"
          >
            <Maximize2 aria-hidden="true" />
            <kbd>Space</kbd>
          </button>
        </header>
        <div className="detail-file-tree-scroll">
          {change.files.length === 0 ? (
            <p>No files changed</p>
          ) : (
            <ChangedFileTree
              files={change.files}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
              onOpenSelectedFile={(path) => {
                onOpenDiffQuickLook(
                  change,
                  path,
                  diffViewMode,
                  whitespaceMode,
                );
              }}
            />
          )}
        </div>
      </section>
      {selectedFilePath || diffLoading || diffError ? (
        <DiffViewer
          projection={diff}
          loading={diffLoading}
          error={diffError}
          viewMode={diffViewMode}
          whitespaceMode={whitespaceMode}
          onViewModeChange={onDiffViewModeChange}
          onWhitespaceModeChange={onWhitespaceModeChange}
          onOpenSeparateWindow={
            selectedFilePath
              ? () =>
                  onOpenDiffQuickLook(
                    change,
                    selectedFilePath,
                    diffViewMode,
                    whitespaceMode,
                  )
              : undefined
          }
        />
      ) : (
        <section className="diff-empty">
          <Files aria-hidden="true" />
          <div>
            <strong>Select a changed file</strong>
            <span>Choose a file from the tree to load its bounded diff.</span>
          </div>
        </section>
      )}
    </aside>
  );
}

interface FileTreeNode {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  file?: ChangedFile;
}

function buildFileTree(files: ChangedFile[]) {
  const root: FileTreeNode = { name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    for (const [index, part] of parts.entries()) {
      const path = parts.slice(0, index + 1).join("/");
      const child = node.children.get(part) ?? {
        name: part,
        path,
        children: new Map<string, FileTreeNode>(),
      };
      node.children.set(part, child);
      node = child;
    }
    node.file = file;
  }
  return root;
}

export function ChangedFileTree({
  files,
  selectedFilePath,
  onSelectFile,
  onOpenSelectedFile,
}: {
  files: ChangedFile[];
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  onOpenSelectedFile?: (path: string) => void;
}) {
  const root = useMemo(() => buildFileTree(files), [files]);
  return (
    <ul className="file-tree">
      {[...root.children.values()].map((node) => (
        <FileTreeBranch
          node={node}
          depth={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          onOpenSelectedFile={onOpenSelectedFile}
          key={node.path}
        />
      ))}
    </ul>
  );
}

function FileTreeBranch({
  node,
  depth,
  selectedFilePath,
  onSelectFile,
  onOpenSelectedFile,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  onOpenSelectedFile?: (path: string) => void;
}) {
  const children = [...node.children.values()].sort((left, right) => {
    const leftDirectory = left.children.size > 0;
    const rightDirectory = right.children.size > 0;
    if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  if (node.file) {
    return (
      <li>
        <button
          type="button"
          className={selectedFilePath === node.file.path ? "selected" : ""}
          style={{ "--tree-depth": depth } as CSSProperties}
          onPointerDown={(event) =>
            event.currentTarget.focus({ preventScroll: true })
          }
          onClick={(event) => {
            const button = event.currentTarget;
            onSelectFile(node.file!.path);
            window.requestAnimationFrame(() =>
              button.focus({ preventScroll: true }),
            );
          }}
          onKeyDown={(event) => {
            if (
              event.key !== " " &&
              event.key !== "Spacebar" &&
              event.code !== "Space"
            ) {
              return;
            }
            if (!onOpenSelectedFile) return;
            event.preventDefault();
            event.stopPropagation();
            onOpenSelectedFile(node.file!.path);
          }}
          data-file-path={node.file.path}
        >
          <File aria-hidden="true" />
          <span title={node.file.displayPath || node.file.path}>{node.name}</span>
          <code>{node.file.status}</code>
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
          {children.map((child) => (
            <FileTreeBranch
              node={child}
              depth={depth + 1}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
              onOpenSelectedFile={onOpenSelectedFile}
              key={child.path}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}

function Detail({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <dl className="detail-pair">
      <dt>{label}</dt>
      <dd
        className={`${mono ? "mono" : ""} ${accent ? "accent" : ""}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
    </dl>
  );
}

function Identity({
  label,
  icon,
  name,
  email,
  timestamp,
}: {
  label: string;
  icon: ReactNode;
  name: string;
  email?: string;
  timestamp: string;
}) {
  return (
    <article className="identity-card">
      <span className="identity-icon">{icon}</span>
      <div>
        <span className="identity-heading">
          <span className="identity-label">{label}</span>
          <strong>{name}</strong>
        </span>
        <span className="identity-meta">
          {email && <code>{email}</code>}
          <time dateTime={timestamp} title={absoluteTime(timestamp)}>
            {absoluteTime(timestamp)} · {relativeTime(timestamp)}
          </time>
        </span>
      </div>
    </article>
  );
}

function ParentReferences({
  changeIds,
  commitIds,
}: {
  changeIds: string[];
  commitIds: string[];
}) {
  if (changeIds.length === 0 && commitIds.length === 0) {
    return <span>—</span>;
  }

  const length = Math.max(changeIds.length, commitIds.length);
  return (
    <span className="parent-references">
      {Array.from({ length }, (_, index) => {
        const changeId = changeIds[index];
        const commitId = commitIds[index];
        return (
          <span key={`${changeId ?? ""}-${commitId ?? ""}-${index}`}>
            <code title={commitId}>{commitId ? commitId.slice(0, 12) : "—"}</code>
            {changeId && <small>change {changeId}</small>}
          </span>
        );
      })}
    </span>
  );
}
