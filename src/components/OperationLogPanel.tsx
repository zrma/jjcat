import { useEffect, useState } from "react";
import { History, RotateCcw, RotateCw, X } from "lucide-react";
import { relativeTime } from "../lib/format";
import { adjacentNavigationIndex } from "../lib/keyboardNavigation";
import type { OperationLogProjection } from "../types";
import { CliSpinner } from "./CliSpinner";

interface OperationLogPanelProps {
  projection: OperationLogProjection | null;
  loading: boolean;
  error: string | null;
  executing: "undo" | "redo" | null;
  onClose: () => void;
  onRequestUndo: (operationId: string) => void;
  onRequestRedo: (operationId: string) => void;
}

export function OperationLogPanel({
  projection,
  loading,
  error,
  executing,
  onClose,
  onRequestUndo,
  onRequestRedo,
}: OperationLogPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(projection?.operations[0]?.id ?? null), [projection]);
  const selected =
    projection?.operations.find((operation) => operation.id === selectedId) ??
    projection?.operations[0];

  return (
    <aside
      className="operation-log-panel"
      aria-label="Repository operation log"
      data-keyboard-navigation="operations"
    >
      <header>
        <div>
          <History aria-hidden="true" />
          <strong>Operation log</strong>
          <span>Read-only · latest 20</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close operation log">
          <X aria-hidden="true" />
        </button>
      </header>
      {loading && (
        <p className="operation-state activity-copy">
          <CliSpinner />
          <span>Loading repository operations…</span>
        </p>
      )}
      {!loading && error && <p className="operation-state error">{error}</p>}
      {!loading && !error && projection && (
        <div className="operation-content">
          <section
            className="operation-list"
            aria-label="Recent operations"
            tabIndex={0}
            onPointerDown={(event) => {
              const target = event.target;
              const operationButton =
                target instanceof Element
                  ? target.closest<HTMLButtonElement>(
                      "button[data-operation-id]",
                    )
                  : null;
              if (operationButton) {
                operationButton.focus({ preventScroll: true });
                return;
              }
              event.currentTarget.focus({ preventScroll: true });
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              const operations = projection.operations;
              const currentIndex = operations.findIndex(
                (operation) => operation.id === selected?.id,
              );
              const nextIndex = adjacentNavigationIndex(
                operations.length,
                currentIndex,
                event.key === "ArrowDown" ? 1 : -1,
              );
              const next = operations[nextIndex];
              if (!next) return;
              event.preventDefault();
              event.stopPropagation();
              if (nextIndex === currentIndex) return;
              setSelectedId(next.id);
              const button = event.currentTarget.querySelector<HTMLButtonElement>(
                `button[data-operation-id="${CSS.escape(next.id)}"]`,
              );
              button?.focus({ preventScroll: true });
              button?.scrollIntoView({ block: "nearest" });
            }}
          >
            {projection.operations.length === 0 ? (
              <p>No operations reported.</p>
            ) : (
              projection.operations.map((operation) => (
                <button
                  type="button"
                  className={operation.id === selected?.id ? "selected" : ""}
                  onPointerDown={(event) =>
                    event.currentTarget.focus({ preventScroll: true })
                  }
                  onClick={() => setSelectedId(operation.id)}
                  data-operation-id={operation.id}
                  key={operation.id}
                >
                  <span className="operation-node" aria-hidden="true" />
                  <span>
                    <strong>{operation.description || "(no description)"}</strong>
                    <small>
                      <code title={operation.id}>{operation.id.slice(0, 12)}</code> ·{" "}
                      {relativeTime(operation.startedAt)}
                    </small>
                  </span>
                  <span className="operation-badges">
                    {operation.current && <em>Current</em>}
                    {operation.snapshot && <em>Snapshot</em>}
                  </span>
                </button>
              ))
            )}
          </section>
          <section className="operation-preview" aria-label="Operation history actions">
            {selected && (
              <>
                <div>
                  <span>Selected operation</span>
                  <strong>{selected.description || "(no description)"}</strong>
                  <code title={selected.id}>{selected.id.slice(0, 12)}</code>
                </div>
                <div className="undo-preview eligible">
                  <History aria-hidden="true" />
                  <span>
                    <strong>Step through repository history</strong>
                    <small>
                      Undo and redo run immediately. Repeat either action to move
                      through multiple steps.
                    </small>
                  </span>
                </div>
                <div className="operation-history-actions">
                  <button
                    type="button"
                    disabled={!projection.undoTarget || executing !== null}
                    onClick={() =>
                      projection.undoTarget && onRequestUndo(projection.undoTarget)
                    }
                  >
                    {executing === "undo" ? (
                      <CliSpinner />
                    ) : (
                      <RotateCcw aria-hidden="true" />
                    )}
                    <span>
                      <strong>{executing === "undo" ? "Undoing…" : "Undo"}</strong>
                      <small>⌘Z · Ctrl+Z</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!projection.redoTarget || executing !== null}
                    onClick={() =>
                      projection.redoTarget && onRequestRedo(projection.redoTarget)
                    }
                  >
                    {executing === "redo" ? (
                      <CliSpinner />
                    ) : (
                      <RotateCw aria-hidden="true" />
                    )}
                    <span>
                      <strong>{executing === "redo" ? "Redoing…" : "Redo"}</strong>
                      <small>⌘⇧Z · Ctrl+Y</small>
                    </span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
