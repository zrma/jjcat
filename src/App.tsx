import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleX,
  Database,
  File,
  FolderGit2,
  GitBranch,
  Laptop,
  Plus,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { bridge, isTauriRuntime } from "./bridge";
import { isStale, locationLabel, relativeTime } from "./lib/format";
import type {
  AppError,
  CachedProjection,
  ChangeRow,
  Registry,
  RepositoryDraft,
  RepositoryRecord,
} from "./types";

type RepositoryState =
  | "ready"
  | "cached"
  | "stale"
  | "refreshing"
  | "disconnected"
  | "disconnected-cached"
  | "empty";

function App() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    document.body.dataset.runtime = isTauriRuntime ? "tauri" : "browser";
    bridge
      .loadRegistry()
      .then((snapshot) => {
        setRegistry(snapshot.registry);
        setRecoveryNotice(snapshot.recoveryNotice);
        setOpenIds(snapshot.registry.repositories.map((repository) => repository.id));
      })
      .catch((error: AppError) => setFatalError(error.message));
  }, []);

  const selectedRepository = registry?.repositories.find(
    (repository) => repository.id === registry.selectedRepository,
  );
  const selectedCache = selectedRepository
    ? registry?.cachedProjections[selectedRepository.id]
    : undefined;
  const selectedProjection = selectedCache?.projection;
  const selectedChange = useMemo(() => {
    const changes = selectedProjection?.changes ?? [];
    return changes.find((change) => change.changeId === selectedChangeId) ?? changes[0];
  }, [selectedChangeId, selectedProjection]);

  useEffect(() => {
    setSelectedChangeId(null);
  }, [selectedRepository?.id]);

  const selectRepository = useCallback(
    async (repositoryId: string) => {
      if (!registry) return;
      setOpenIds((current) =>
        current.includes(repositoryId) ? current : [...current, repositoryId],
      );
      setRegistry({ ...registry, selectedRepository: repositoryId });
      try {
        await bridge.selectRepository(repositoryId);
      } catch (error) {
        setFatalError((error as AppError).message);
      }
    },
    [registry],
  );

  const refreshRepository = useCallback(
    async (repositoryId: string) => {
      if (!registry) return;
      const activeRequest = refreshing[repositoryId];
      if (activeRequest) {
        await bridge.cancelRefresh(activeRequest);
        return;
      }
      const requestId = crypto.randomUUID();
      setRefreshing((current) => ({ ...current, [repositoryId]: requestId }));
      setErrors((current) => {
        const next = { ...current };
        delete next[repositoryId];
        return next;
      });
      try {
        const cached = await bridge.refreshRepository(repositoryId, requestId);
        setRegistry((current) =>
          current
            ? {
                ...current,
                cachedProjections: { ...current.cachedProjections, [repositoryId]: cached },
              }
            : current,
        );
        setFreshIds((current) => new Set(current).add(repositoryId));
      } catch (error) {
        const appError = error as AppError;
        setErrors((current) => ({ ...current, [repositoryId]: appError.message }));
      } finally {
        setRefreshing((current) => {
          const next = { ...current };
          delete next[repositoryId];
          return next;
        });
      }
    },
    [refreshing, registry],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        if (selectedRepository) void refreshRepository(selectedRepository.id);
      }
      if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
        const repositoryId = openIds[Number(event.key) - 1];
        if (repositoryId) {
          event.preventDefault();
          void selectRepository(repositoryId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIds, refreshRepository, selectRepository, selectedRepository]);

  async function registerRepository(draft: RepositoryDraft) {
    try {
      const snapshot = await bridge.registerRepository(draft);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      const selected = snapshot.registry.selectedRepository;
      if (selected) setOpenIds((current) => (current.includes(selected) ? current : [...current, selected]));
      setShowAdd(false);
    } catch (error) {
      throw error as AppError;
    }
  }

  function closeTab(repositoryId: string) {
    const next = openIds.filter((id) => id !== repositoryId);
    setOpenIds(next);
    if (registry?.selectedRepository === repositoryId && next[0]) {
      void selectRepository(next[0]);
    }
  }

  if (fatalError) {
    return (
      <main className="fatal-state">
        <CircleX aria-hidden="true" />
        <h1>jjcat could not start</h1>
        <p>{fatalError}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }

  if (!registry) {
    return <main className="loading-state">Loading repositories…</main>;
  }

  const openRepositories = openIds
    .map((id) => registry.repositories.find((repository) => repository.id === id))
    .filter((repository): repository is RepositoryRecord => Boolean(repository));
  const selectedState = selectedRepository
    ? repositoryState(selectedRepository.id, selectedCache, freshIds, refreshing, errors)
    : "empty";

  return (
    <main className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="traffic-lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="wordmark" data-tauri-drag-region>
          <span>jjcat</span>
          <svg aria-hidden="true" viewBox="0 0 42 18">
            <path d="M2 14c9 0 9-10 18-10 6 0 7 7 12 7h7" />
            <circle cx="40" cy="11" r="2" />
          </svg>
        </div>
        <nav className="tabs" aria-label="Open repositories">
          {openRepositories.map((repository) => {
            const state = repositoryState(
              repository.id,
              registry.cachedProjections[repository.id],
              freshIds,
              refreshing,
              errors,
            );
            const active = repository.id === selectedRepository?.id;
            return (
              <div className={`tab ${active ? "active" : ""}`} key={repository.id}>
                <button type="button" onClick={() => void selectRepository(repository.id)}>
                  <StatusDot state={state} />
                  <span>{repository.displayName}</span>
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`Close ${repository.displayName} tab`}
                  onClick={() => closeTab(repository.id)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </nav>
      </header>

      <aside className="repository-rail">
        <div className="rail-heading">
          <h2>Repositories</h2>
          <button type="button" aria-label="Add repository" onClick={() => setShowAdd(true)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
        {(["local", "ssh"] as const).map((kind) => (
          <section className="repository-group" key={kind}>
            <h3>{locationLabel(kind)}</h3>
            {registry.repositories
              .filter((repository) => repository.location.kind === kind)
              .map((repository) => {
                const state = repositoryState(
                  repository.id,
                  registry.cachedProjections[repository.id],
                  freshIds,
                  refreshing,
                  errors,
                );
                return (
                  <button
                    type="button"
                    className={`repository-row ${repository.id === selectedRepository?.id ? "selected" : ""}`}
                    onClick={() => void selectRepository(repository.id)}
                    key={repository.id}
                  >
                    {kind === "local" ? <Database aria-hidden="true" /> : <Server aria-hidden="true" />}
                    <span>{repository.displayName}</span>
                    <StatusDot state={state} />
                  </button>
                );
              })}
          </section>
        ))}
      </aside>

      <section className="workspace">
        {recoveryNotice && (
          <div className="notice recovery-notice">
            <AlertTriangle aria-hidden="true" /> {recoveryNotice}
          </div>
        )}
        {!selectedRepository ? (
          <EmptyRepository onAdd={() => setShowAdd(true)} />
        ) : (
          <>
            <header className="repository-toolbar">
              <div className="repository-title">
                <FolderGit2 aria-hidden="true" />
                <strong>{selectedRepository.displayName}</strong>
                <span className="divider" />
                <GitBranch aria-hidden="true" />
                <span>{selectedChange?.bookmarks[0] ?? "@"}</span>
                <span className="divider" />
                {selectedRepository.location.kind === "local" ? (
                  <Laptop aria-hidden="true" />
                ) : (
                  <Server aria-hidden="true" />
                )}
                <span>{locationLabel(selectedRepository.location.kind)}</span>
              </div>
              <button
                type="button"
                className={`refresh-button ${selectedState === "refreshing" ? "active" : ""}`}
                onClick={() => void refreshRepository(selectedRepository.id)}
              >
                {selectedState === "refreshing" ? <X aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                {selectedState === "refreshing" ? "Cancel" : "Refresh"}
              </button>
            </header>
            {errors[selectedRepository.id] && (
              <div className="notice error-notice" role="status">
                <AlertTriangle aria-hidden="true" />
                <span>{errors[selectedRepository.id]}</span>
                {selectedCache && <span className="notice-tail">Showing cached data.</span>}
              </div>
            )}
            <div className="content-grid">
              <ChangeLog
                changes={selectedProjection?.changes ?? []}
                selected={selectedChange?.changeId}
                onSelect={(changeId) => setSelectedChangeId(changeId)}
                emptyState={selectedState}
              />
              <ChangeDetails change={selectedChange} />
            </div>
          </>
        )}
      </section>

      <footer className="statusbar">
        {selectedRepository ? (
          <>
            <StatusDot state={selectedState} />
            <span>{selectedRepository.displayName}</span>
            <span className="divider" />
            <span>{selectedChange?.bookmarks[0] ?? "@"}</span>
            <span className="divider" />
            <strong>{stateLabel(selectedState)}</strong>
            <span className="status-spacer" />
            <span>jj {selectedProjection?.capability.detectedVersion ?? "not detected"}</span>
            {selectedCache && <span>{relativeTime(selectedCache.cachedAt)}</span>}
            {registry.repositories
              .filter((repository) => repository.id !== selectedRepository.id)
              .slice(0, 1)
              .map((repository) => {
                const state = repositoryState(
                  repository.id,
                  registry.cachedProjections[repository.id],
                  freshIds,
                  refreshing,
                  errors,
                );
                return (
                  <button
                    type="button"
                    className="status-repository-switch"
                    onClick={() => void selectRepository(repository.id)}
                    key={repository.id}
                  >
                    <StatusDot state={state} />
                    <span>{repository.displayName}</span>
                    <span className="divider" />
                    <strong>{stateLabel(state)}</strong>
                  </button>
                );
              })}
          </>
        ) : (
          <span>No repository selected</span>
        )}
      </footer>

      {showAdd && (
        <AddRepositoryDialog onClose={() => setShowAdd(false)} onSubmit={registerRepository} />
      )}
    </main>
  );
}

function repositoryState(
  repositoryId: string,
  cache: CachedProjection | undefined,
  freshIds: Set<string>,
  refreshing: Record<string, string>,
  errors: Record<string, string>,
): RepositoryState {
  if (refreshing[repositoryId]) return "refreshing";
  if (errors[repositoryId]) return cache ? "disconnected-cached" : "disconnected";
  if (!cache) return "empty";
  if (freshIds.has(repositoryId)) return "ready";
  return isStale(cache.cachedAt) ? "stale" : "cached";
}

function stateLabel(state: RepositoryState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "refreshing":
      return "Refreshing";
    case "disconnected":
      return "Disconnected";
    case "disconnected-cached":
      return "Disconnected · Cached";
    case "stale":
      return "Cached · Stale";
    case "cached":
      return "Cached";
    case "empty":
      return "Never refreshed";
  }
}

function StatusDot({ state }: { state: RepositoryState }) {
  return <span className={`status-dot ${state}`} aria-label={stateLabel(state)} />;
}

function ChangeLog({
  changes,
  selected,
  onSelect,
  emptyState,
}: {
  changes: ChangeRow[];
  selected?: string;
  onSelect: (changeId: string) => void;
  emptyState: RepositoryState;
}) {
  if (changes.length === 0) {
    return (
      <section className="change-log empty-log">
        <FolderGit2 aria-hidden="true" />
        <h2>No cached changes</h2>
        <p>
          {emptyState === "refreshing"
            ? "Reading the repository…"
            : "Refresh this repository to load its Jujutsu change graph."}
        </p>
      </section>
    );
  }
  return (
    <section className="change-log" aria-label="Change log">
      <div className="log-header">
        <span>Change</span>
        <span>Author</span>
        <span>Updated</span>
      </div>
      <div className="log-body">
        <DagGraph changes={changes} />
        {changes.map((change) => (
          <button
            type="button"
            className={`change-row ${change.changeId === selected ? "selected" : ""}`}
            onClick={() => onSelect(change.changeId)}
            key={`${change.changeId}-${change.commitId}`}
          >
            <span className="change-summary">
              <code>{change.changeId}</code>
              {change.workingCopy && <strong>Working copy</strong>}
              <span>{change.summary || "(no description)"}</span>
            </span>
            <span className="change-author">{change.author || "—"}</span>
            <span className="change-updated">{relativeTime(change.updatedAt)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DagGraph({ changes }: { changes: ChangeRow[] }) {
  const rowHeight = 78;
  const nodeX = 35;
  return (
    <svg
      className="dag-graph"
      aria-hidden="true"
      width="76"
      height={changes.length * rowHeight}
      viewBox={`0 0 76 ${changes.length * rowHeight}`}
    >
      {changes.map((change, index) => {
        const y = index * rowHeight + rowHeight / 2;
        const nextY = y + rowHeight;
        return (
          <g key={`${change.changeId}-graph`}>
            {index < changes.length - 1 && <path d={`M${nodeX} ${y} L${nodeX} ${nextY}`} />}
            {change.parents.length > 1 && index < changes.length - 1 && (
              <path className="branch-line" d={`M${nodeX} ${y} C${nodeX + 28} ${y + 15}, ${nodeX + 28} ${nextY - 15}, ${nodeX} ${nextY}`} />
            )}
            <circle
              className={change.workingCopy ? "working-node" : change.changeId === "000000000000" ? "root-node" : ""}
              cx={nodeX}
              cy={y}
              r={change.workingCopy ? 9 : 7}
            />
          </g>
        );
      })}
    </svg>
  );
}

function ChangeDetails({ change }: { change?: ChangeRow }) {
  return (
    <aside className="change-details">
      <header>
        <File aria-hidden="true" />
        <h2>Change details</h2>
      </header>
      {!change ? (
        <p className="details-empty">Select a change to inspect it.</p>
      ) : (
        <div className="details-body">
          <h3>{change.summary || "(no description)"}</h3>
          <Detail label="Change ID" value={change.changeId} mono />
          <Detail label="Commit ID" value={change.commitId} mono />
          <Detail label="Author" value={change.author || "Unknown"} />
          <Detail label="Bookmarks" value={change.bookmarks.join(", ") || "—"} accent />
          <section className="files-section">
            <h4>Files ({change.files.length})</h4>
            {change.files.length === 0 ? (
              <p>No files changed</p>
            ) : (
              <ul>
                {change.files.slice(0, 12).map((file) => (
                  <li key={`${file.status}-${file.path}`}>
                    <File aria-hidden="true" />
                    <span title={file.path}>{file.path}</span>
                    <code>{file.status}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
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
  value: string;
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

function EmptyRepository({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="empty-repository">
      <FolderGit2 aria-hidden="true" />
      <h1>Add your first repository</h1>
      <p>Register a local path or an OpenSSH host alias to start a read-only session.</p>
      <button type="button" onClick={onAdd}>
        <Plus aria-hidden="true" /> Add repository
      </button>
    </section>
  );
}

function AddRepositoryDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (draft: RepositoryDraft) => Promise<void>;
}) {
  const [kind, setKind] = useState<"local" | "ssh">("local");
  const [displayName, setDisplayName] = useState("");
  const [path, setPath] = useState("");
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const location = kind === "local" ? { kind, path } : { kind, host, path };
    try {
      await onSubmit({ displayName, location });
    } catch (submitError) {
      setError((submitError as AppError).message);
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="repository-dialog" aria-labelledby="add-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="add-title">Add repository</h2>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="transport-toggle" aria-label="Repository location type">
          <button type="button" className={kind === "local" ? "selected" : ""} onClick={() => setKind("local")}>
            <Laptop aria-hidden="true" /> Local
          </button>
          <button type="button" className={kind === "ssh" ? "selected" : ""} onClick={() => setKind("ssh")}>
            <Server aria-hidden="true" /> SSH
          </button>
        </div>
        <label>
          Display name
          <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="my-repository" required maxLength={80} />
        </label>
        {kind === "ssh" && (
          <label>
            OpenSSH host alias
            <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="dev-box" required />
          </label>
        )}
        <label>
          Repository path
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={kind === "local" ? "/absolute/path/to/repository" : "~/projects/repository"}
            required
          />
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Adding…" : "Add repository"}</button>
        </footer>
      </form>
    </div>
  );
}

export default App;
