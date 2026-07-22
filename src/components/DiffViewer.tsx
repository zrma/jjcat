import { Columns2, Rows3 } from "lucide-react";
import { pairSideBySide } from "../lib/diff";
import type {
  DiffLine,
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
  return (
    <section className="diff-viewer" aria-label="Selected file diff">
      <header className="diff-toolbar">
        <div className="diff-title">
          <strong title={projection?.file.path}>{projection?.file.path ?? "File diff"}</strong>
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
        <section className="diff-hunk" key={`${hunk.header}-${hunkIndex}`}>
          <header>{hunk.header}</header>
          {pairSideBySide(hunk.lines).map((row, rowIndex) => (
            <div className="diff-pair" key={rowIndex}>
              <DiffSide line={row.left} side="old" />
              <DiffSide line={row.right} side="new" />
            </div>
          ))}
        </section>
      ))}
    </div>
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
