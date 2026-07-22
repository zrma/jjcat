import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { File, Files, FolderGit2 } from "lucide-react";
import { relativeTime } from "../lib/format";
import { virtualRange } from "../lib/virtualization";
import type { ChangeRow } from "../types";
import { BookmarkLabels } from "./BookmarkLabels";

interface ChangeWorkspaceProps {
  changes: ChangeRow[];
  selectedChange?: ChangeRow;
  onSelect: (changeId: string) => void;
  refreshing: boolean;
}

const VIRTUALIZATION_THRESHOLD = 40;
const HISTORY_ROW_HEIGHT = 34;
const HISTORY_HEADER_HEIGHT = 30;
const HISTORY_OVERSCAN = 6;

export function ChangeWorkspace({
  changes,
  selectedChange,
  onSelect,
  refreshing,
}: ChangeWorkspaceProps) {
  return (
    <div className="content-grid">
      <ChangeLog
        changes={changes}
        selected={selectedChange?.changeId}
        onSelect={onSelect}
        refreshing={refreshing}
      />
      <ChangeDetails change={selectedChange} />
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
  selected,
  onSelect,
  virtualized,
  viewportHeight,
  scrollTop,
}: {
  changes: ChangeRow[];
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
            <DagCell change={change} index={index} count={changes.length} />
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

function DagCell({ change, index, count }: { change: ChangeRow; index: number; count: number }) {
  const hasPrevious = index > 0;
  const hasNext = index < count - 1;
  const isRoot = change.changeId === "000000000000";
  return (
    <span className="dag-cell" aria-hidden="true">
      <svg viewBox="0 0 42 34" preserveAspectRatio="none">
        {hasPrevious && <path d="M21 0V17" />}
        {hasNext && <path d="M21 17V34" />}
        {change.parents.length > 1 && hasNext && (
          <path className="branch-line" d="M21 17 C38 20 38 31 21 34" />
        )}
        <circle
          className={`${change.workingCopy ? "working-node" : ""} ${isRoot ? "root-node" : ""}`}
          cx="21"
          cy="17"
          r={change.workingCopy ? "6" : "4.5"}
        />
      </svg>
    </span>
  );
}

function ChangeDetails({ change }: { change?: ChangeRow }) {
  if (!change) {
    return (
      <aside className="change-details details-empty">
        <FolderGit2 aria-hidden="true" />
        <p>Select a change to inspect its files and metadata.</p>
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
          <ul>
            {change.files.map((file) => (
              <li key={`${file.status}-${file.path}`}>
                <File aria-hidden="true" />
                <span title={file.path}>{file.path}</span>
                <code>{file.status}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="detail-inspector">
        <header>
          <h2>{change.summary || "(no description)"}</h2>
        </header>
        <div className="detail-grid">
          <Detail label="Change ID" value={change.changeId} mono />
          <Detail label="Commit ID" value={change.commitId} mono />
          <Detail label="Author" value={change.author || "Unknown"} />
          <Detail
            label="Bookmarks"
            value={<BookmarkLabels bookmarks={change.bookmarks} emptyLabel="—" />}
          />
          <Detail label="Parents" value={change.parents.join(", ") || "—"} mono />
          <Detail label="Conflict state" value={change.conflict ? "Conflicted" : "No conflicts"} />
          <Detail label="Working copy" value={change.workingCopy ? "Yes" : "No"} accent={change.workingCopy} />
          <Detail label="Empty" value={change.empty ? "Yes" : "No"} />
        </div>
      </section>
    </aside>
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
      <dd className={`${mono ? "mono" : ""} ${accent ? "accent" : ""}`}>{value}</dd>
    </dl>
  );
}
