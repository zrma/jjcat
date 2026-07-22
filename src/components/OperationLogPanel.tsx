import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { relativeTime } from "../lib/format";
import type { OperationLogProjection } from "../types";

interface OperationLogPanelProps {
  projection: OperationLogProjection | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export function OperationLogPanel({
  projection,
  loading,
  error,
  onClose,
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
                      <code>{operation.id}</code> · {relativeTime(operation.startedAt)}
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
                  <code>{selected.id}</code>
                </div>
                <div className={`undo-preview ${selected.undoEligible ? "eligible" : ""}`}>
                  <RotateCcw aria-hidden="true" />
                  <span>
                    <strong>
                      {selected.undoEligible ? "Latest operation can be previewed for undo" : "Not an undo target"}
                    </strong>
                    <small>
                      {selected.undoEligible
                        ? `Target ${projection.undoTarget}. P2 never executes the mutation.`
                        : "Only the current non-snapshot operation is eligible."}
                    </small>
                  </span>
                </div>
                <button type="button" disabled title="Undo execution is intentionally deferred to P3">
                  <RotateCcw aria-hidden="true" /> Undo unavailable in P2
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
