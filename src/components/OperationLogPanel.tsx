import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { relativeTime } from "../lib/format";
import type { OperationLogProjection } from "../types";

interface OperationLogPanelProps {
  projection: OperationLogProjection | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRequestUndo: (operationId: string) => void;
}

export function OperationLogPanel({
  projection,
  loading,
  error,
  onClose,
  onRequestUndo,
}: OperationLogPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(projection?.operations[0]?.id ?? null), [projection]);
  const selected =
    projection?.operations.find((operation) => operation.id === selectedId) ??
    projection?.operations[0];

  return (
    <aside className="operation-log-panel" aria-label="Repository operation log">
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
      {loading && <p className="operation-state">Loading repository operations…</p>}
      {!loading && error && <p className="operation-state error">{error}</p>}
      {!loading && !error && projection && (
        <div className="operation-content">
          <section className="operation-list" aria-label="Recent operations">
            {projection.operations.length === 0 ? (
              <p>No operations reported.</p>
            ) : (
              projection.operations.map((operation) => (
                <button
                  type="button"
                  className={operation.id === selected?.id ? "selected" : ""}
                  onClick={() => setSelectedId(operation.id)}
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
          <section className="operation-preview" aria-label="Undo eligibility preview">
            {selected && (
              <>
                <div>
                  <span>Selected operation</span>
                  <strong>{selected.description || "(no description)"}</strong>
                  <code title={selected.id}>{selected.id.slice(0, 12)}</code>
                </div>
                <div className={`undo-preview ${selected.undoEligible ? "eligible" : ""}`}>
                  <RotateCcw aria-hidden="true" />
                  <span>
                    <strong>
                      {selected.undoEligible ? "Latest operation can be previewed for undo" : "Not an undo target"}
                    </strong>
                    <small>
                      {selected.undoEligible
                        ? `Target ${selected.id.slice(0, 12)}. Execution still requires an exact preview.`
                        : "Only the current non-snapshot operation is eligible."}
                    </small>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!selected.undoEligible}
                  onClick={() => onRequestUndo(selected.id)}
                >
                  <RotateCcw aria-hidden="true" /> Preview undo
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
