import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Columns2, Rows3 } from "lucide-react";
import { pairSideBySide } from "../lib/diff";
import type {
  DiffLine,
  DiffHunk,
  DiffViewMode,
  FileDiffProjection,
  WhitespaceMode,
} from "../types";

interface DiffViewerProps {
  projection: FileDiffProjection | null;
  loading: boolean;
  error: string | null;
  viewMode: DiffViewMode;
  whitespaceMode: WhitespaceMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onWhitespaceModeChange: (mode: WhitespaceMode) => void;
}

export function DiffViewer({
  projection,
  loading,
  error,
  viewMode,
  whitespaceMode,
  onViewModeChange,
  onWhitespaceModeChange,
}: DiffViewerProps) {
  const displayPath = projection?.file.displayPath || projection?.file.path;
  return (
    <section className="diff-viewer" aria-label="Selected file diff">
      <header className="diff-toolbar">
        <div className="diff-title">
          <strong title={displayPath}>{displayPath ?? "File diff"}</strong>
          {projection && (
            <span>
              <em>+{projection.additions}</em> <del>−{projection.deletions}</del>
            </span>
          )}
        </div>
        <div className="diff-controls">
          <div className="segmented-control" aria-label="Diff layout">
            <button
              type="button"
              className={viewMode === "unified" ? "selected" : ""}
              aria-pressed={viewMode === "unified"}
              onClick={() => onViewModeChange("unified")}
              title="Unified diff"
            >
              <Rows3 aria-hidden="true" /> Unified
            </button>
            <button
              type="button"
              className={viewMode === "sideBySide" ? "selected" : ""}
              aria-pressed={viewMode === "sideBySide"}
              onClick={() => onViewModeChange("sideBySide")}
              title="Side-by-side diff"
            >
              <Columns2 aria-hidden="true" /> Side by side
            </button>
          </div>
          <label className="whitespace-control">
            <span>Whitespace</span>
            <select
              value={whitespaceMode}
              onChange={(event) =>
                onWhitespaceModeChange(event.target.value as WhitespaceMode)
              }
            >
              <option value="preserve">Show all</option>
              <option value="ignoreAll">Ignore all</option>
            </select>
          </label>
        </div>
      </header>
      <div className="diff-content" aria-busy={loading}>
        {loading && <p className="diff-state">Loading the selected file…</p>}
        {!loading && error && <p className="diff-state error">{error}</p>}
        {!loading && !error && projection?.binary && (
          <p className="diff-state">Binary content is not rendered. File metadata remains available.</p>
        )}
        {!loading && !error && projection?.truncated && (
          <p className="diff-warning">Diff exceeded the 512 KiB safety limit and was truncated.</p>
        )}
        {!loading && !error && projection && !projection.binary && projection.hunks.length === 0 && (
          <p className="diff-state">No textual changes in this whitespace mode.</p>
        )}
        {!loading && !error && projection && !projection.binary && viewMode === "unified" && (
          <UnifiedDiff projection={projection} />
        )}
        {!loading && !error && projection && !projection.binary && viewMode === "sideBySide" && (
          <SideBySideDiff projection={projection} />
        )}
      </div>
    </section>
  );
}

function UnifiedDiff({ projection }: { projection: FileDiffProjection }) {
  return (
    <div className="unified-diff">
      {projection.hunks.map((hunk, hunkIndex) => (
        <section className="diff-hunk" key={`${hunk.header}-${hunkIndex}`}>
          <header>{hunk.header}</header>
          {hunk.lines.map((line, lineIndex) => (
            <div className={`diff-line ${line.kind}`} key={`${lineIndex}-${line.content}`}>
              <code>{line.oldLine ?? ""}</code>
              <code>{line.newLine ?? ""}</code>
              <span aria-hidden="true">{lineMarker(line)}</span>
              <pre>{line.content || " "}</pre>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function SideBySideDiff({ projection }: { projection: FileDiffProjection }) {
  return (
    <div className="side-by-side-diff">
      {projection.hunks.map((hunk, hunkIndex) => (
        <SideBySideHunk
          hunk={hunk}
          key={`${hunk.header}-${hunkIndex}`}
        />
      ))}
    </div>
  );
}

function SideBySideHunk({ hunk }: { hunk: DiffHunk }) {
  const rows = pairSideBySide(hunk.lines);
  return (
    <section className="diff-hunk">
      <header>{hunk.header}</header>
      <div className="diff-panes">
        <DiffPane rows={rows} side="old" label="Before" />
        <DiffPane rows={rows} side="new" label="After" />
      </div>
    </section>
  );
}

function DiffPane({
  rows,
  side,
  label,
}: {
  rows: ReturnType<typeof pairSideBySide>;
  side: "old" | "new";
  label: "Before" | "After";
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    scrollRange: number;
    thumbRange: number;
  } | null>(null);
  const viewportId = useId();
  const [metrics, setMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollLeft: 0,
  });
  const updateMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setMetrics({
      clientWidth: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      scrollLeft: viewport.scrollLeft,
    });
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(viewport);
    if (viewport.firstElementChild) {
      observer.observe(viewport.firstElementChild);
    }
    return () => observer.disconnect();
  }, [updateMetrics]);

  const scrollRange = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const hasOverflow = scrollRange > 1;
  const thumbWidth = hasOverflow
    ? Math.max(36, (metrics.clientWidth ** 2) / metrics.scrollWidth)
    : metrics.clientWidth;
  const thumbRange = Math.max(0, metrics.clientWidth - thumbWidth);
  const thumbOffset =
    hasOverflow && thumbRange > 0
      ? (metrics.scrollLeft / scrollRange) * thumbRange
      : 0;

  const setScrollLeft = (value: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, Math.min(scrollRange, value));
    updateMetrics();
  };

  return (
    <section className={`diff-pane ${side}`} aria-label={label}>
      <header>{label}</header>
      <div
        className="diff-pane-scroll"
        id={viewportId}
        ref={viewportRef}
        tabIndex={0}
        aria-label={`Scroll ${label.toLowerCase()} diff horizontally`}
        onScroll={updateMetrics}
      >
        <div className="diff-pane-lines">
          {rows.map((row, rowIndex) => (
            <DiffSide
              line={side === "old" ? row.left : row.right}
              side={side}
              key={rowIndex}
            />
          ))}
        </div>
      </div>
      <div
        className={`diff-horizontal-scrollbar ${hasOverflow ? "" : "disabled"}`}
        role={hasOverflow ? "scrollbar" : undefined}
        aria-label={hasOverflow ? `${label} horizontal scroll` : undefined}
        aria-controls={hasOverflow ? viewportId : undefined}
        aria-orientation={hasOverflow ? "horizontal" : undefined}
        aria-valuemin={hasOverflow ? 0 : undefined}
        aria-valuemax={hasOverflow ? Math.round(scrollRange) : undefined}
        aria-valuenow={hasOverflow ? Math.round(metrics.scrollLeft) : undefined}
        tabIndex={hasOverflow ? 0 : -1}
        onKeyDown={(event) => {
          if (!hasOverflow) return;
          const page = Math.max(40, metrics.clientWidth * 0.8);
          const next = {
            ArrowLeft: metrics.scrollLeft - 40,
            ArrowRight: metrics.scrollLeft + 40,
            PageUp: metrics.scrollLeft - page,
            PageDown: metrics.scrollLeft + page,
            Home: 0,
            End: scrollRange,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          setScrollLeft(next);
        }}
        onPointerDown={(event) => {
          if (!hasOverflow || event.button !== 0 || event.target !== event.currentTarget) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const nextOffset = Math.max(
            0,
            Math.min(thumbRange, event.clientX - bounds.left - thumbWidth / 2),
          );
          setScrollLeft((nextOffset / thumbRange) * scrollRange);
        }}
      >
        <span
          className="diff-horizontal-scrollbar-thumb"
          style={{
            width: `${thumbWidth}px`,
            transform: `translateX(${thumbOffset}px)`,
          }}
          onPointerDown={(event) => {
            if (!hasOverflow || event.button !== 0) return;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startScrollLeft: metrics.scrollLeft,
              scrollRange,
              thumbRange,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId || drag.thumbRange <= 0) {
              return;
            }
            setScrollLeft(
              drag.startScrollLeft +
                ((event.clientX - drag.startX) / drag.thumbRange) *
                  drag.scrollRange,
            );
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onLostPointerCapture={() => {
            dragRef.current = null;
          }}
        />
      </div>
    </section>
  );
}

function DiffSide({ line, side }: { line: DiffLine | null; side: "old" | "new" }) {
  const number = side === "old" ? line?.oldLine : line?.newLine;
  return (
    <div className={`diff-side ${line?.kind ?? "empty"}`}>
      <code>{number ?? ""}</code>
      <span aria-hidden="true">{line ? lineMarker(line) : ""}</span>
      <pre>{line?.content || " "}</pre>
    </div>
  );
}

function lineMarker(line: DiffLine) {
  if (line.kind === "addition") return "+";
  if (line.kind === "deletion") return "−";
  if (line.kind === "metadata") return "·";
  return " ";
}
