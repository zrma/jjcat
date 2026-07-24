import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  GitBranchPlus,
  GitFork,
  GitPullRequestArrow,
  Network,
  RotateCcw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { bridge } from "../bridge";
import type {
  AppError,
  ChangeRow,
  MutationExecution,
  MutationIntent,
  MutationKind,
  MutationPreview,
} from "../types";

interface MutationDialogProps {
  repositoryId: string;
  repositoryName: string;
  changes: ChangeRow[];
  selectedChange?: ChangeRow;
  undoTarget: string | null;
  initialIntent: MutationIntent;
  previewImmediately: boolean;
  onClose: () => void;
  onExecuted: (execution: MutationExecution) => void;
}

const ACTION_LABELS: Record<MutationKind, string> = {
  new: "New change",
  edit: "Edit change",
  describe: "Describe change",
  fetch: "Fetch remote",
  rebase: "Rebase onto…",
  squash: "Squash into…",
  split: "Split paths",
  abandon: "Abandon change",
  pruneEmpty: "Prune empty changes",
  undo: "Undo current operation",
  bookmarkMove: "Move bookmark",
  push: "Push bookmark",
};

const CONFIGURABLE_ACTIONS = new Set<MutationKind>([
  "describe",
  "rebase",
  "squash",
  "split",
  "bookmarkMove",
  "push",
]);

function shortId(value: string) {
  return value.slice(0, 12);
}

export function MutationDialog({
  repositoryId,
  repositoryName,
  changes,
  selectedChange,
  undoTarget,
  initialIntent,
  previewImmediately,
  onClose,
  onExecuted,
}: MutationDialogProps) {
  const fallback = selectedChange ?? changes[0];
  const kind = initialIntent.kind;
  const [sourceCommitId, setSourceCommitId] = useState(
    "sourceCommitId" in initialIntent
      ? initialIntent.sourceCommitId
      : "targetCommitId" in initialIntent
        ? initialIntent.targetCommitId
        : "targetCommitIds" in initialIntent
          ? initialIntent.targetCommitIds[0] ?? ""
          : "parentCommitIds" in initialIntent
            ? initialIntent.parentCommitIds[0] ?? ""
            : fallback?.commitId ?? "",
  );
  const [destinationCommitId, setDestinationCommitId] = useState(
    "destinationCommitId" in initialIntent
      ? initialIntent.destinationCommitId
      : fallback?.parentCommitIds?.[0] ?? changes[1]?.commitId ?? "",
  );
  const [message, setMessage] = useState(
    initialIntent.kind === "describe"
      ? initialIntent.message
      : initialIntent.kind === "split"
        ? initialIntent.message
      : selectedChange?.description ?? selectedChange?.summary ?? "",
  );
  const [paths, setPaths] = useState(
    initialIntent.kind === "split"
      ? initialIntent.paths.join("\n")
      : selectedChange?.files.map((file) => file.path).join("\n") ?? "",
  );
  const [bookmark, setBookmark] = useState(
    initialIntent.kind === "bookmarkMove" || initialIntent.kind === "push"
      ? initialIntent.name
      : selectedChange?.bookmarks.find((item) => !item.remote)?.name ?? "main",
  );
  const [remote, setRemote] = useState(
    initialIntent.kind === "fetch"
      ? initialIntent.remote ?? ""
      : initialIntent.kind === "push"
        ? initialIntent.remote
        : "origin",
  );
  const [preview, setPreview] = useState<MutationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initialPreviewStarted = useRef(false);
  const contextChange =
    changes.find((change) => change.commitId === sourceCommitId) ?? fallback;

  function buildIntent(): MutationIntent | null {
    const target = sourceCommitId || fallback?.commitId || "";
    switch (kind) {
      case "new":
        return { kind, parentCommitIds: [target] };
      case "edit":
        return { kind, targetCommitId: target };
      case "describe":
        return { kind, targetCommitId: target, message };
      case "fetch":
        return { kind, remote: remote.trim() || null };
      case "rebase":
        return { kind, sourceCommitId: target, destinationCommitId };
      case "squash":
        return { kind, sourceCommitId: target, destinationCommitId };
      case "split":
        return {
          kind,
          sourceCommitId: target,
          paths: paths
            .split(/\r?\n|,/)
            .map((path) => path.trim())
            .filter(Boolean),
          message,
        };
      case "abandon":
        return { kind, targetCommitIds: [target] };
      case "pruneEmpty":
        return { kind };
      case "undo":
        return undoTarget ? { kind, operationId: undoTarget } : null;
      case "bookmarkMove":
        return { kind, name: bookmark.trim(), targetCommitId: target };
      case "push":
        return { kind, name: bookmark.trim(), remote: remote.trim() };
    }
  }

  async function requestPreview(intent = buildIntent()) {
    if (!intent) {
      setError("The selected operation does not have a valid target.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPreview(await bridge.previewMutation(repositoryId, intent));
      setTypedConfirmation("");
    } catch (requestError) {
      setError((requestError as AppError).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!previewImmediately || initialPreviewStarted.current) return;
    initialPreviewStarted.current = true;
    void requestPreview(initialIntent);
  }, [initialIntent, previewImmediately]);

  useEffect(() => {
    const firstMutable = changes.find((change) => !/^0+$/.test(change.commitId));
    if (
      ["edit", "describe", "rebase", "squash", "split", "abandon"].includes(kind) &&
      /^0+$/.test(sourceCommitId)
    ) {
      setSourceCommitId(firstMutable?.commitId ?? "");
    }
    if (kind === "squash" && /^0+$/.test(destinationCommitId)) {
      setDestinationCommitId(
        changes.find(
          (change) =>
            !/^0+$/.test(change.commitId) && change.commitId !== sourceCommitId,
        )?.commitId ?? "",
      );
    }
  }, [changes, destinationCommitId, kind, sourceCommitId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !executing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [executing, onClose]);

  async function execute() {
    if (!preview) return;
    setExecuting(true);
    setError(null);
    try {
      const execution = await bridge.executeMutation({
        token: preview.token,
        confirmed: true,
        confirmation: preview.requiresTypedConfirmation
          ? typedConfirmation
          : null,
      });
      onExecuted(execution);
    } catch (executionError) {
      setError((executionError as AppError).message);
    } finally {
      setExecuting(false);
    }
  }

  const actionLabel = ACTION_LABELS[kind];
  const configurable = CONFIGURABLE_ACTIONS.has(kind);
  const executeDisabled =
    executing ||
    (preview?.requiresTypedConfirmation &&
      typedConfirmation !== preview.confirmationPhrase) ||
    (preview?.kind === "pruneEmpty" && preview.candidates.length === 0);
  const executeLabel =
    preview?.kind === "pruneEmpty" && preview.candidates.length > 0
      ? `Prune ${preview.candidates.length} empty ${
          preview.candidates.length === 1 ? "change" : "changes"
        }`
      : preview?.title;

  return (
    <div className="dialog-backdrop mutation-backdrop" role="presentation">
      <section
        className="mutation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mutation-title"
      >
        <header>
          <div>
            <MutationRiskIcon kind={kind} />
            <span>
              <h2 id="mutation-title">
                {preview ? preview.title : actionLabel}
              </h2>
              <small>
                {repositoryName} ·{" "}
                {preview ? "preview before execution" : "configure exact targets"}
              </small>
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={executing} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>

        {!preview ? (
          <form
            className="mutation-form"
            onSubmit={(event) => {
              event.preventDefault();
              void requestPreview();
            }}
          >
            {contextChange &&
              ["describe", "rebase", "squash", "split", "bookmarkMove"].includes(
                kind,
              ) && (
                <div className="mutation-subject">
                  <span>Selected change</span>
                  <code>{contextChange.changeId}</code>
                  <strong>{contextChange.summary || "(no description)"}</strong>
                </div>
              )}

            {(kind === "rebase" || kind === "squash") && (
              <ChangeSelect
                label="Destination change"
                changes={changes}
                value={destinationCommitId}
                onChange={setDestinationCommitId}
                exclude={sourceCommitId}
                excludeRoot={kind === "squash"}
              />
            )}

            {kind === "describe" && (
              <label>
                Full description
                <textarea
                  rows={7}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
            )}

            {kind === "split" && (
              <>
                <label>
                  Paths
                  <textarea
                    rows={5}
                    value={paths}
                    onChange={(event) => setPaths(event.target.value)}
                    placeholder="One repository-relative path per line"
                  />
                </label>
                <label>
                  New change description
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
              </>
            )}

            {(kind === "bookmarkMove" || kind === "push") && (
              <label>
                Bookmark
                <input
                  value={bookmark}
                  onChange={(event) => setBookmark(event.target.value)}
                />
              </label>
            )}

            {(kind === "fetch" || kind === "push") && (
              <label>
                Remote
                <input
                  value={remote}
                  onChange={(event) => setRemote(event.target.value)}
                  placeholder={kind === "fetch" ? "Blank uses configured default" : "origin"}
                />
              </label>
            )}

            {kind === "pruneEmpty" && (
              <div className="mutation-guidance">
                <Trash2 aria-hidden="true" />
                <span>
                  <strong>Protected pruning</strong>
                  <small>
                    Current <code>@</code>, root, immutable, local-bookmarked, and
                    remote-bookmarked changes are excluded by the repository query.
                  </small>
                </span>
              </div>
            )}

            {kind === "undo" && (
              <div className="mutation-guidance">
                <RotateCcw aria-hidden="true" />
                <span>
                  <strong>
                    {undoTarget
                      ? `Current operation ${shortId(undoTarget)}`
                      : "Load Operations before undo"}
                  </strong>
                  <small>Only the exact current non-snapshot operation is eligible.</small>
                </span>
              </div>
            )}

            {error && <p className="dialog-error">{error}</p>}
            <footer>
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? "Building preview…" : `Review ${actionLabel}`}
              </button>
            </footer>
          </form>
        ) : (
          <div className="mutation-preview">
            <section className={`mutation-risk risk-${preview.risk}`}>
              <MutationRiskIcon kind={preview.kind} />
              <span>
                <strong>{preview.risk.replace(/([A-Z])/g, " $1")}</strong>
                <small>{preview.effect}</small>
              </span>
            </section>

            <section className="mutation-targets" aria-label="Exact mutation targets">
              <header>
                <strong>Exact targets</strong>
                <code>op {shortId(preview.expectedOperationId)}</code>
              </header>
              {preview.targets.length === 0 ? (
                <p>Targets are resolved by the protected repository query below.</p>
              ) : (
                <dl>
                  {preview.targets.map((target, index) => (
                    <div key={`${target.label}-${target.value}-${index}`}>
                      <dt>{target.label}</dt>
                      <dd>
                        {target.commitId ? (
                          <code title={target.commitId}>{shortId(target.commitId)}</code>
                        ) : (
                          target.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {preview.kind === "pruneEmpty" && (
              <section className="prune-candidates">
                <header>
                  <strong>Eligible empty changes</strong>
                  <span>{preview.candidates.length}</span>
                </header>
                {preview.candidates.length === 0 ? (
                  <p>Nothing is eligible. Protected and current changes remain untouched.</p>
                ) : (
                  <ul>
                    {preview.candidates.map((candidate) => (
                      <li key={candidate.commitId}>
                        <code>{candidate.changeId}</code>
                        <span>{candidate.summary || "(no description)"}</span>
                        <code>{shortId(candidate.commitId)}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {preview.requiresTypedConfirmation && (
              <label className="typed-confirmation">
                Type <code>{preview.confirmationPhrase}</code> to continue
                <input
                  autoFocus
                  value={typedConfirmation}
                  onChange={(event) => setTypedConfirmation(event.target.value)}
                  spellCheck={false}
                />
              </label>
            )}

            {error && (
              <p className="dialog-error">
                <AlertTriangle aria-hidden="true" /> {error}
              </p>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (configurable) {
                    setPreview(null);
                    setError(null);
                  } else {
                    onClose();
                  }
                }}
                disabled={executing}
              >
                {configurable ? "Back" : "Cancel"}
              </button>
              <button
                type="button"
                className={preview.risk === "destructive" ? "danger" : "primary"}
                disabled={executeDisabled}
                onClick={() => void execute()}
              >
                {executing ? "Executing…" : executeLabel}
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}

function ChangeSelect({
  label,
  changes,
  value,
  exclude,
  excludeRoot = false,
  onChange,
}: {
  label: string;
  changes: ChangeRow[];
  value: string;
  exclude?: string;
  excludeRoot?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {changes
          .filter(
            (change) =>
              change.commitId !== exclude &&
              (!excludeRoot || !/^0+$/.test(change.commitId)),
          )
          .map((change) => (
            <option value={change.commitId} key={change.commitId}>
              {change.changeId} · {change.summary || "(no description)"}
            </option>
          ))}
      </select>
    </label>
  );
}

function MutationRiskIcon({ kind }: { kind: MutationKind }) {
  if (kind === "rebase" || kind === "squash") return <GitFork aria-hidden="true" />;
  if (kind === "split") return <Scissors aria-hidden="true" />;
  if (kind === "fetch") return <ArrowDownToLine aria-hidden="true" />;
  if (kind === "push") return <Network aria-hidden="true" />;
  if (kind === "bookmarkMove") return <GitBranchPlus aria-hidden="true" />;
  if (kind === "undo") return <RotateCcw aria-hidden="true" />;
  if (kind === "abandon" || kind === "pruneEmpty") return <Trash2 aria-hidden="true" />;
  return <GitPullRequestArrow aria-hidden="true" />;
}
