import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  File,
  Files,
  Folder,
  FolderGit2,
  GitCommitHorizontal,
  History,
  Info,
  UserRound,
} from "lucide-react";
import { absoluteTime, relativeTime } from "../lib/format";
import { layoutDag, type DagRowLayout } from "../lib/dag";
import {
  clampSplitterSize,
  splitterBounds,
  splitterSizeForKey,
} from "../lib/splitter";
import { virtualRange } from "../lib/virtualization";
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
import { DiffViewer } from "./DiffViewer";
import { OperationLogPanel } from "./OperationLogPanel";

interface ChangeWorkspaceProps {
  changes: ChangeRow[];
  selectedChange?: ChangeRow;
  onSelect: (changeId: string) => void;
  refreshing: boolean;
  selectedFilePath: string | null;
  diff: FileDiffProjection | null;
  diffLoading: boolean;
  diffError: string | null;
  diffViewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onSelectFile: (path: string) => void;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
  inspectorView: InspectorView;
  onInspectorViewChange: (view: InspectorView) => void;
  operationLog: OperationLogProjection | null;
  operationLoading: boolean;
  operationError: string | null;
}

const VIRTUALIZATION_THRESHOLD = 40;
const HISTORY_ROW_HEIGHT = 20;
const HISTORY_HEADER_HEIGHT = 21;
const HISTORY_OVERSCAN = 6;
const DAG_LANE_GAP = 14;
const DAG_PADDING = 8;
const MAX_VISIBLE_DAG_LANES = 10;
const MIN_HISTORY_HEIGHT = 140;
const MIN_INSPECTOR_HEIGHT = 180;
const SPLITTER_SIZE = 5;
const SPLITTER_KEY_STEP = 24;

export function ChangeWorkspace({
  changes,
  selectedChange,
  onSelect,
  refreshing,
  selectedFilePath,
  diff,
  diffLoading,
  diffError,
  diffViewMode,
  whitespaceMode,
  onSelectFile,
  onDiffViewModeChange,
  onWhitespaceModeChange,
  inspectorView,
  onInspectorViewChange,
  operationLog,
  operationLoading,
  operationError,
}: ChangeWorkspaceProps) {
  const contentGridRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const splitterDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [inspectorHeight, setInspectorHeight] = useState<number | null>(null);
  const bounds = splitterBounds(
    contentHeight,
    MIN_HISTORY_HEIGHT,
    MIN_INSPECTOR_HEIGHT,
    SPLITTER_SIZE,
  );
  const currentInspectorHeight = clampSplitterSize(
    inspectorHeight ??
      Math.round(contentHeight * 0.4),
    bounds,
  );
  const gridStyle = inspectorHeight === null
    ? undefined
    : ({ "--inspector-height": `${currentInspectorHeight}px` } as CSSProperties);

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
    if (inspectorHeight === null || contentHeight === 0) return;
    setInspectorHeight((current) => {
      if (current === null) return null;
      const next = clampSplitterSize(current, bounds);
      return next === current ? current : next;
    });
  }, [bounds.max, bounds.min, contentHeight, inspectorHeight]);

  useEffect(
    () => () => {
      document.body.classList.remove("workspace-resizing");
    },
    [],
  );

  const finishSplitterDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (splitterDragRef.current?.pointerId !== event.pointerId) return;
    splitterDragRef.current = null;
    document.body.classList.remove("workspace-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="content-grid" ref={contentGridRef} style={gridStyle}>
      <ChangeLog
        changes={changes}
        selected={selectedChange?.changeId}
        onSelect={onSelect}
        refreshing={refreshing}
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
        onDoubleClick={() => setInspectorHeight(null)}
        onKeyDown={(event) => {
          const next = splitterSizeForKey(
            event.key,
            currentInspectorHeight,
            bounds,
            SPLITTER_KEY_STEP,
          );
          if (next === null) return;
          event.preventDefault();
          setInspectorHeight(next);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const measuredHeight =
            inspectorRef.current?.getBoundingClientRect().height ??
            currentInspectorHeight;
          splitterDragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: measuredHeight,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          document.body.classList.add("workspace-resizing");
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const drag = splitterDragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setInspectorHeight(
            clampSplitterSize(
              drag.startHeight + drag.startY - event.clientY,
              bounds,
            ),
          );
        }}
        onPointerUp={finishSplitterDrag}
        onPointerCancel={finishSplitterDrag}
        onLostPointerCapture={() => {
          splitterDragRef.current = null;
          document.body.classList.remove("workspace-resizing");
        }}
      />
      <section
        className="inspector-shell"
        aria-label="Change inspector"
        ref={inspectorRef}
      >
        <nav className="inspector-tabs" aria-label="Inspector views">
          <button
            type="button"
            className={inspectorView === "overview" ? "selected" : ""}
            onClick={() => onInspectorViewChange("overview")}
          >
            <Info aria-hidden="true" />
            Overview
          </button>
          <button
            type="button"
            className={inspectorView === "changes" ? "selected" : ""}
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
        </nav>
        <div className="inspector-panel">
          {inspectorView === "operations" ? (
            <OperationLogPanel
              projection={operationLog}
              loading={operationLoading}
              error={operationError}
              onClose={() => onInspectorViewChange("overview")}
            />
          ) : inspectorView === "changes" ? (
            <ChangeFiles
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
            />
          ) : (
            <ChangeOverview change={selectedChange} onSelectFile={onSelectFile} />
          )}
        </div>
      </section>
    </div>
  );
}

function ChangeLog({
  changes,
  selected,
  onSelect,
  refreshing,
}: {
  changes: ChangeRow[];
  selected?: string;
  onSelect: (changeId: string) => void;
  refreshing: boolean;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ height: 600, scrollTop: 0 });
  const virtualized = changes.length >= VIRTUALIZATION_THRESHOLD;
  const dag = useMemo(() => layoutDag(changes), [changes]);
  const visibleLaneCount = Math.min(dag.maxLaneCount, MAX_VISIBLE_DAG_LANES);
  const dagWidth = Math.max(42, DAG_PADDING * 2 + visibleLaneCount * DAG_LANE_GAP);
  const graphStyle = { "--dag-width": `${dagWidth}px` } as CSSProperties;

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
  }, [changes[0]?.changeId]);

  useEffect(() => {
    const index = changes.findIndex((change) => change.changeId === selected);
    const element = scrollRef.current;
    if (!element || index < 0) return;
    const rowTop = HISTORY_HEADER_HEIGHT + index * HISTORY_ROW_HEIGHT;
    const rowBottom = rowTop + HISTORY_ROW_HEIGHT;
    if (rowTop < element.scrollTop + HISTORY_HEADER_HEIGHT) {
      element.scrollTop = Math.max(0, rowTop - HISTORY_HEADER_HEIGHT);
    } else if (rowBottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = rowBottom - element.clientHeight;
    }
  }, [changes, selected]);

  if (changes.length === 0) {
    return (
      <section className="change-log empty-log">
        <FolderGit2 aria-hidden="true" />
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
      aria-rowcount={changes.length}
      ref={scrollRef}
      style={graphStyle}
      onScroll={(event) => {
        const scrollTop = event.currentTarget.scrollTop;
        setViewport((current) => ({ ...current, scrollTop }));
      }}
    >
      <div className="log-header" aria-hidden="true">
        <span>Graph</span>
        <span>Change</span>
        <span>Description</span>
        <span>Author</span>
        <span className="col-commit">Commit</span>
        <span>Updated</span>
      </div>
      <ChangeRows
        changes={changes}
        dagRows={dag.rows}
        dagWidth={dagWidth}
        selected={selected}
        onSelect={onSelect}
        virtualized={virtualized}
        viewportHeight={viewport.height}
        scrollTop={viewport.scrollTop}
      />
    </section>
  );
}

function ChangeRows({
  changes,
  dagRows,
  dagWidth,
  selected,
  onSelect,
  virtualized,
  viewportHeight,
  scrollTop,
}: {
  changes: ChangeRow[];
  dagRows: DagRowLayout[];
  dagWidth: number;
  selected?: string;
  onSelect: (changeId: string) => void;
  virtualized: boolean;
  viewportHeight: number;
  scrollTop: number;
}) {
  const range = virtualized
    ? virtualRange(
        changes.length,
        HISTORY_ROW_HEIGHT,
        viewportHeight,
        scrollTop,
        HISTORY_OVERSCAN,
      )
    : {
        startIndex: 0,
        endIndex: changes.length,
        offsetTop: 0,
        totalHeight: changes.length * HISTORY_ROW_HEIGHT,
      };
  const visibleChanges = changes.slice(range.startIndex, range.endIndex);

  return (
    <div
      className={`log-body ${virtualized ? "virtualized" : ""}`}
      style={virtualized ? { height: range.totalHeight } : undefined}
      data-rendered-rows={visibleChanges.length}
    >
      {visibleChanges.map((change, visibleIndex) => {
        const index = range.startIndex + visibleIndex;
        return (
          <button
            type="button"
            className={`change-row ${virtualized ? "virtualized-row" : ""} ${change.changeId === selected ? "selected" : ""}`}
            style={virtualized ? { top: index * HISTORY_ROW_HEIGHT } : undefined}
            aria-posinset={index + 1}
            aria-setsize={changes.length}
            onClick={() => onSelect(change.changeId)}
            key={`${change.changeId}-${change.commitId}`}
          >
            <DagCell change={change} layout={dagRows[index]} width={dagWidth} />
            <code className="change-id">{change.changeId}</code>
            <span className="change-description">
              <BookmarkLabels bookmarks={change.bookmarks} limit={2} />
              <span className="change-summary">{change.summary || "(no description)"}</span>
              {change.workingCopy && <strong>Working Copy</strong>}
              {change.conflict && <strong className="conflict-label">Conflict</strong>}
            </span>
            <span className="change-author">{change.author || "—"}</span>
            <code className="change-commit col-commit">{change.commitId}</code>
            <span className="change-updated">{relativeTime(change.updatedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

function laneX(lane: number) {
  return DAG_PADDING + Math.min(lane, MAX_VISIBLE_DAG_LANES - 1) * DAG_LANE_GAP;
}

function DagCell({
  change,
  layout,
  width,
}: {
  change: ChangeRow;
  layout: DagRowLayout;
  width: number;
}) {
  const isRoot = change.changeId === "000000000000";
  const nodeX = laneX(layout.lane);
  return (
    <span
      className="dag-cell"
      aria-hidden="true"
      data-lane={layout.lane}
      data-lane-overflow={layout.lane >= MAX_VISIBLE_DAG_LANES ? "true" : undefined}
    >
      <svg viewBox={`0 0 ${width} 20`} preserveAspectRatio="xMinYMid meet">
        {layout.hasIncoming && (
          <path className={`lane-${layout.lane % 6}`} d={`M${nodeX} 0V10`} />
        )}
        {layout.edges.map((edge, index) => {
          const fromX = laneX(edge.fromLane);
          const toX = laneX(edge.toLane);
          const startY = edge.kind === "parent" ? 10 : 0;
          return (
            <path
              className={`lane-${edge.fromLane % 6} ${edge.kind === "parent" && (edge.parentIndex ?? 0) > 0 ? "branch-line" : ""}`}
              d={`M${fromX} ${startY} C${fromX} 14 ${toX} 15 ${toX} 20`}
              key={`${edge.kind}-${edge.fromLane}-${edge.toLane}-${index}`}
            />
          );
        })}
        <circle
          className={`lane-${layout.lane % 6} ${change.workingCopy ? "working-node" : ""} ${isRoot ? "root-node" : ""}`}
          cx={nodeX}
          cy="10"
          r={change.workingCopy ? "4.5" : "3.5"}
        />
      </svg>
    </span>
  );
}

function ChangeOverview({
  change,
  onSelectFile,
}: {
  change?: ChangeRow;
  onSelectFile: (path: string) => void;
}) {
  if (!change) {
    return (
      <aside className="change-overview details-empty">
        <FolderGit2 aria-hidden="true" />
        <p>Select a change to inspect its summary and metadata.</p>
      </aside>
    );
  }

  const description = (change.description || change.summary || "(no description)").trimEnd();
  const [subject, ...messageLines] = description.split("\n");
  const messageBody = messageLines.join("\n").replace(/^\n/, "");
  const authorTimestamp = change.authorTimestamp || change.updatedAt;
  const committerTimestamp = change.committerTimestamp || change.updatedAt;

  return (
    <aside className="change-overview" aria-label="Selected change overview">
      <div className="overview-content">
        <div className="overview-main">
          <section className="identity-grid" aria-label="Commit identities">
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
        </div>
        <section className="overview-files" aria-label="Files changed by this change">
          <header>
            <Files aria-hidden="true" />
            <strong>Changed files</strong>
            <span>{change.files.length}</span>
          </header>
          {change.files.length === 0 ? (
            <p>No files changed</p>
          ) : (
            <ul>
              {change.files.map((file) => (
                <li key={`${file.status}-${file.path}`}>
                  <button type="button" onClick={() => onSelectFile(file.path)}>
                    <File aria-hidden="true" />
                    <span title={file.displayPath || file.path}>
                      {file.displayPath || file.path}
                    </span>
                    <code>{file.status}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
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
}) {
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
      <section className="detail-files">
        <header>
          <Files aria-hidden="true" />
          <h2>Files ({change.files.length})</h2>
        </header>
        {change.files.length === 0 ? (
          <p>No files changed</p>
        ) : (
          <ChangedFileTree
            files={change.files}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        )}
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

function ChangedFileTree({
  files,
  selectedFilePath,
  onSelectFile,
}: {
  files: ChangedFile[];
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
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
}: {
  node: FileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
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
          onClick={() => onSelectFile(node.file!.path)}
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
        <span className="identity-label">{label}</span>
        <strong>{name}</strong>
        {email && <code>{email}</code>}
        <time dateTime={timestamp} title={absoluteTime(timestamp)}>
          {absoluteTime(timestamp)} · {relativeTime(timestamp)}
        </time>
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
