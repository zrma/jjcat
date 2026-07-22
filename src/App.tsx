import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Cable,
  CircleX,
  Code2,
  Database,
  Folder,
  FolderOpen,
  FolderGit2,
  GitBranch,
  History,
  Laptop,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Server,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { bridge, isTauriRuntime } from "./bridge";
import { BookmarkLabels } from "./components/BookmarkLabels";
import { Brand } from "./components/Brand";
import { ChangeWorkspace } from "./components/ChangeWorkspace";
import { RepositoryQuickSwitcher } from "./components/RepositoryQuickSwitcher";
import { isStale, locationLabel, relativeTime } from "./lib/format";
import { groupRepositories } from "./lib/repositories";
import { failureBackoffMs, planRepositoryRefreshes } from "./lib/refreshScheduler";
import type {
  AppError,
  CachedProjection,
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
type HistoryView = "all" | "working-copy";
type RepositoryContextMenu = { repositoryId: string; x: number; y: number };

function App() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failureCounts, setFailureCounts] = useState<Record<string, number>>({});
  const [retryAt, setRetryAt] = useState<Record<string, number>>({});
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenu | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RepositoryRecord | null>(null);
  const [repositoryActionError, setRepositoryActionError] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const refreshingRef = useRef<Record<string, string>>({});
  const failureCountsRef = useRef<Record<string, number>>({});
  const cancelledRefreshesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.body.dataset.runtime = isTauriRuntime ? "tauri" : "browser";
    bridge
      .loadRegistry()
      .then((snapshot) => {
        setRegistry(snapshot.registry);
        setRecoveryNotice(snapshot.recoveryNotice);
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
  const visibleChanges = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return (selectedProjection?.changes ?? []).filter((change) => {
      if (historyView === "working-copy" && !change.workingCopy) return false;
      if (!query) return true;
      return [
        change.summary,
        change.author,
        change.changeId,
        change.commitId,
        ...change.bookmarks.flatMap((bookmark) => [bookmark.name, bookmark.remote ?? ""]),
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [historyView, searchQuery, selectedProjection]);
  const selectedChange = useMemo(() => {
    return (
      visibleChanges.find((change) => change.changeId === selectedChangeId) ?? visibleChanges[0]
    );
  }, [selectedChangeId, visibleChanges]);

  useEffect(() => {
    setSelectedChangeId(null);
    setSearchQuery("");
    setHistoryView("all");
  }, [selectedRepository?.id]);

  const selectRepository = useCallback(
    async (repositoryId: string) => {
      try {
        const snapshot = await bridge.selectRepository(repositoryId);
        setRegistry(snapshot.registry);
        setRecoveryNotice(snapshot.recoveryNotice);
        setRepositoryActionError(null);
      } catch (error) {
        setRepositoryActionError((error as AppError).message);
      }
    },
    [],
  );

  const refreshRepository = useCallback(
    async (repositoryId: string, cancelActive = true) => {
      if (!registry) return;
      const activeRequest = refreshingRef.current[repositoryId];
      if (activeRequest) {
        if (cancelActive) {
          cancelledRefreshesRef.current.add(activeRequest);
          await bridge.cancelRefresh(activeRequest);
        }
        return;
      }
      const requestId = crypto.randomUUID();
      refreshingRef.current[repositoryId] = requestId;
      setRefreshing((current) => ({ ...current, [repositoryId]: requestId }));
      setErrors((current) => {
        const next = { ...current };
        delete next[repositoryId];
        return next;
      });
      setRetryAt((current) => {
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
        delete failureCountsRef.current[repositoryId];
        setFailureCounts((current) => {
          const next = { ...current };
          delete next[repositoryId];
          return next;
        });
      } catch (error) {
        if (cancelledRefreshesRef.current.delete(requestId)) return;
        const appError = error as AppError;
        setErrors((current) => ({ ...current, [repositoryId]: appError.message }));
        const nextFailureCount = (failureCountsRef.current[repositoryId] ?? 0) + 1;
        failureCountsRef.current[repositoryId] = nextFailureCount;
        setFailureCounts((current) => ({ ...current, [repositoryId]: nextFailureCount }));
        setRetryAt((current) => ({
          ...current,
          [repositoryId]: Date.now() + failureBackoffMs(nextFailureCount),
        }));
      } finally {
        if (refreshingRef.current[repositoryId] === requestId) {
          delete refreshingRef.current[repositoryId];
        }
        setRefreshing((current) => {
          const next = { ...current };
          delete next[repositoryId];
          return next;
        });
      }
    },
    [registry],
  );

  useEffect(() => {
    if (
      !selectedRepository ||
      selectedCache ||
      errors[selectedRepository.id] ||
      refreshingRef.current[selectedRepository.id]
    ) {
      return;
    }
    void refreshRepository(selectedRepository.id, false);
  }, [errors, refreshRepository, selectedCache, selectedRepository]);

  useEffect(() => {
    if (!registry) return;
    const timers = planRepositoryRefreshes(
      registry.openRepositoryIds,
      registry.selectedRepository,
      registry.cachedProjections,
      failureCounts,
      Date.now(),
    ).map(({ repositoryId, delayMs }) =>
      window.setTimeout(() => void refreshRepository(repositoryId, false), delayMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [failureCounts, refreshRepository, registry]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        if (selectedRepository) void refreshRepository(selectedRepository.id);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSwitcher(true);
      }
      if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
        const repositoryId = registry?.openRepositoryIds[Number(event.key) - 1];
        if (repositoryId) {
          event.preventDefault();
          void selectRepository(repositoryId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshRepository, registry?.openRepositoryIds, selectRepository, selectedRepository]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
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
  }, [contextMenu]);

  async function registerRepository(draft: RepositoryDraft) {
    try {
      const snapshot = await bridge.registerRepository(draft);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setShowAdd(false);
      setRepositoryActionError(null);
    } catch (error) {
      throw error as AppError;
    }
  }

  async function removeRepository(repository: RepositoryRecord) {
    try {
      const snapshot = await bridge.removeRepository(repository.id);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setFreshIds((current) => {
        const next = new Set(current);
        next.delete(repository.id);
        return next;
      });
      setErrors((current) => {
        const next = { ...current };
        delete next[repository.id];
        return next;
      });
      delete failureCountsRef.current[repository.id];
      setFailureCounts((current) => {
        const next = { ...current };
        delete next[repository.id];
        return next;
      });
      setRetryAt((current) => {
        const next = { ...current };
        delete next[repository.id];
        return next;
      });
      setRemoveTarget(null);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
      setRemoveTarget(null);
    }
  }

  async function setRepositoryPinned(repository: RepositoryRecord, pinned: boolean) {
    try {
      const snapshot = await bridge.setRepositoryPinned(repository.id, pinned);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    }
  }

  async function launchHandoff(target: "editor" | "terminal") {
    if (!selectedRepository) return;
    try {
      const preview = await bridge.launchRepositoryHandoff(selectedRepository.id, target);
      setHandoffNotice(`${preview.actionLabel}: ${preview.repositoryDisplayName}`);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    }
  }

  async function closeTab(repositoryId: string) {
    if (!registry) return;
    const openIndex = registry.openRepositoryIds.indexOf(repositoryId);
    const next = registry.openRepositoryIds.filter((id) => id !== repositoryId);
    const selectedRepository =
      registry.selectedRepository === repositoryId
        ? next[openIndex] ?? next[openIndex - 1] ?? null
        : registry.selectedRepository;
    try {
      const snapshot = await bridge.updateOpenRepositories(next, selectedRepository);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
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

  const openRepositories = registry.openRepositoryIds
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
        <Brand />
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
                  onClick={() => void closeTab(repository.id)}
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
          <div className="rail-actions">
            <button type="button" aria-label="Switch repository" title="Switch repository (⌘K)" onClick={() => setShowSwitcher(true)}>
              <Search aria-hidden="true" />
            </button>
            <button type="button" aria-label="Add repository" onClick={() => setShowAdd(true)}>
              <Plus aria-hidden="true" />
            </button>
          </div>
        </div>
        <nav className="history-navigation" aria-label="History views">
          <button
            type="button"
            className={historyView === "working-copy" ? "selected" : ""}
            onClick={() => setHistoryView("working-copy")}
            disabled={!selectedRepository}
          >
            <FolderGit2 aria-hidden="true" />
            <span>Working Copy</span>
          </button>
          <button
            type="button"
            className={historyView === "all" ? "selected" : ""}
            onClick={() => setHistoryView("all")}
            disabled={!selectedRepository}
          >
            <History aria-hidden="true" />
            <span>All Changes</span>
          </button>
        </nav>
        {groupRepositories(registry.repositories).map((group) => (
          <section className="repository-group" key={group.label}>
            <h3>{group.label}</h3>
            {group.repositories.map((repository) => {
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
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({
                        repositoryId: repository.id,
                        x: Math.min(event.clientX, window.innerWidth - 190),
                        y: Math.min(event.clientY, window.innerHeight - 118),
                      });
                    }}
                    key={repository.id}
                  >
                    {repository.location.kind === "local" ? <Database aria-hidden="true" /> : <Server aria-hidden="true" />}
                    <span>{repository.displayName}</span>
                    <span className={`repository-state ${state}`}>{compactStateLabel(state)}</span>
                    <StatusDot state={state} />
                  </button>
                );
              })}
          </section>
        ))}
      </aside>

      <section className="workspace">
        {repositoryActionError && (
          <div className="notice error-notice" role="status">
            <AlertTriangle aria-hidden="true" /> {repositoryActionError}
          </div>
        )}
        {handoffNotice && (
          <div className="notice handoff-notice" role="status">
            {handoffNotice}
          </div>
        )}
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
                <BookmarkLabels bookmarks={selectedChange?.bookmarks ?? []} limit={1} emptyLabel="@" />
                <span className="divider" />
                {selectedRepository.location.kind === "local" ? (
                  <Laptop aria-hidden="true" />
                ) : (
                  <Server aria-hidden="true" />
                )}
                <span>{locationLabel(selectedRepository.location.kind)}</span>
              </div>
              <div className="toolbar-controls">
                <button
                  type="button"
                  className="handoff-button"
                  title={`Open ${selectedRepository.displayName} in VS Code`}
                  onClick={() => void launchHandoff("editor")}
                >
                  <Code2 aria-hidden="true" />
                  <span className="sr-only">Open in VS Code</span>
                </button>
                <button
                  type="button"
                  className="handoff-button"
                  title={`Open terminal for ${selectedRepository.displayName}`}
                  onClick={() => void launchHandoff("terminal")}
                >
                  <SquareTerminal aria-hidden="true" />
                  <span className="sr-only">Open terminal</span>
                </button>
                <label className="history-search">
                  <Search aria-hidden="true" />
                  <span className="sr-only">Filter changes</span>
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Filter changes"
                  />
                  <kbd>⌘F</kbd>
                </label>
                <button
                  type="button"
                  className={`refresh-button ${selectedState === "refreshing" ? "active" : ""}`}
                  onClick={() => void refreshRepository(selectedRepository.id)}
                >
                  {selectedState === "refreshing" ? <X aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                  {selectedState === "refreshing" ? "Cancel" : "Refresh"}
                </button>
              </div>
            </header>
            {errors[selectedRepository.id] && (
              <div className="notice error-notice" role="status">
                <AlertTriangle aria-hidden="true" />
                <span>{errors[selectedRepository.id]}</span>
                {selectedCache && <span className="notice-tail">Showing cached data.</span>}
                {retryAt[selectedRepository.id] && (
                  <span className="notice-tail">
                    Background retry in {Math.max(1, Math.ceil((retryAt[selectedRepository.id] - Date.now()) / 1000))}s.
                  </span>
                )}
              </div>
            )}
            <ChangeWorkspace
              changes={visibleChanges}
              selectedChange={selectedChange}
              onSelect={setSelectedChangeId}
              refreshing={selectedState === "refreshing"}
            />
          </>
        )}
      </section>

      <footer className="statusbar">
        {selectedRepository ? (
          <>
            <StatusDot state={selectedState} />
            <span>{selectedRepository.displayName}</span>
            <span className="divider" />
            <BookmarkLabels bookmarks={selectedChange?.bookmarks ?? []} limit={1} emptyLabel="@" />
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
      {showSwitcher && (
        <RepositoryQuickSwitcher
          repositories={registry.repositories}
          openRepositoryIds={registry.openRepositoryIds}
          onSelect={selectRepository}
          onClose={() => setShowSwitcher(false)}
        />
      )}
      {contextMenu && (
        <RepositoryMenu
          menu={contextMenu}
          repository={registry.repositories.find(
            (repository) => repository.id === contextMenu.repositoryId,
          )}
          refreshing={Boolean(refreshing[contextMenu.repositoryId])}
          onRefresh={() => {
            setContextMenu(null);
            void refreshRepository(contextMenu.repositoryId);
          }}
          onPin={() => {
            const repository = registry.repositories.find(
              (candidate) => candidate.id === contextMenu.repositoryId,
            );
            setContextMenu(null);
            if (repository) void setRepositoryPinned(repository, !repository.pinned);
          }}
          onRemove={() => {
            const repository = registry.repositories.find(
              (candidate) => candidate.id === contextMenu.repositoryId,
            );
            setContextMenu(null);
            if (repository) setRemoveTarget(repository);
          }}
        />
      )}
      {removeTarget && (
        <RemoveRepositoryDialog
          repository={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void removeRepository(removeTarget)}
        />
      )}
    </main>
  );
}

function repositoryNameFromPath(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || "repository";
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

function compactStateLabel(state: RepositoryState) {
  switch (state) {
    case "ready":
      return "Ready";
    case "refreshing":
      return "Syncing";
    case "disconnected":
    case "disconnected-cached":
      return "Offline";
    case "stale":
      return "Stale";
    case "cached":
      return "Cached";
    case "empty":
      return "New";
  }
}

function StatusDot({ state }: { state: RepositoryState }) {
  return <span className={`status-dot ${state}`} aria-label={stateLabel(state)} />;
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
  const [localPath, setLocalPath] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [host, setHost] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [hostsError, setHostsError] = useState<string | null>(null);
  const [nameEdited, setNameEdited] = useState(false);
  const [browsingLocal, setBrowsingLocal] = useState(false);
  const [browsingRemote, setBrowsingRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    bridge
      .listSshHosts()
      .then((aliases) => {
        if (!current) return;
        setHosts(aliases);
        setHost((selected) => selected || aliases[0] || "");
      })
      .catch((hostError: AppError) => {
        if (current) setHostsError(hostError.message);
      })
      .finally(() => {
        if (current) setHostsLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  function suggestName(selectedPath: string) {
    if (!nameEdited) setDisplayName(repositoryNameFromPath(selectedPath));
  }

  async function browseLocal() {
    setBrowsingLocal(true);
    setError(null);
    try {
      const selectedPath = isTauriRuntime
        ? await open({
            directory: true,
            multiple: false,
            title: "Choose a local Jujutsu repository",
          })
        : "/fixtures/example-repository";
      if (!selectedPath || Array.isArray(selectedPath)) return;
      setLocalPath(selectedPath);
      suggestName(selectedPath);
    } catch (browseError) {
      setError((browseError as AppError).message ?? "The local folder could not be opened.");
    } finally {
      setBrowsingLocal(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const location =
      kind === "local"
        ? { kind, path: localPath }
        : { kind, host, path: remotePath };
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
          <input
            autoFocus
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setNameEdited(true);
            }}
            placeholder="my-repository"
            required
            maxLength={80}
          />
        </label>
        {kind === "ssh" && (
          <label>
            OpenSSH host alias
            <select
              value={host}
              onChange={(event) => setHost(event.target.value)}
              required
              disabled={hostsLoading || hosts.length === 0}
            >
              {hostsLoading && <option value="">Reading OpenSSH config…</option>}
              {!hostsLoading && hosts.length === 0 && (
                <option value="">No explicit host aliases found</option>
              )}
              {hosts.map((alias) => (
                <option value={alias} key={alias}>
                  {alias}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {hostsError ?? "Aliases come from your machine-local OpenSSH config."}
            </span>
          </label>
        )}
        <label>
          Repository path
          <span className="path-input">
            <input
              value={kind === "local" ? localPath : remotePath}
              onChange={(event) =>
                kind === "local"
                  ? setLocalPath(event.target.value)
                  : setRemotePath(event.target.value)
              }
              placeholder="~/projects/repository"
              required
            />
            <button
              type="button"
              aria-label={kind === "local" ? "Browse local folders" : "Browse folders over SSH"}
              title={kind === "local" ? "Browse local folders" : "Browse folders over SSH"}
              onClick={() =>
                kind === "local" ? void browseLocal() : setBrowsingRemote(true)
              }
              disabled={kind === "local" ? browsingLocal : !host}
            >
              {kind === "local" ? <FolderOpen aria-hidden="true" /> : <Cable aria-hidden="true" />}
            </button>
          </span>
          <span className="field-hint">
            {kind === "local"
              ? "Use an absolute path or a path starting with ~/"
              : "Use an absolute remote path or a path starting with ~/"}
          </span>
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Adding…" : "Add repository"}</button>
        </footer>
      </form>
      {browsingRemote && (
        <RemoteFolderDialog
          host={host}
          initialPath={remotePath || "~/"}
          onClose={() => setBrowsingRemote(false)}
          onChoose={(selectedPath) => {
            setRemotePath(selectedPath);
            suggestName(selectedPath);
            setBrowsingRemote(false);
          }}
        />
      )}
    </div>
  );
}

function RemoteFolderDialog({
  host,
  initialPath,
  onClose,
  onChoose,
}: {
  host: string;
  initialPath: string;
  onClose: () => void;
  onChoose: (path: string) => void;
}) {
  const [pathInput, setPathInput] = useState(initialPath);
  const [listing, setListing] = useState<Awaited<
    ReturnType<typeof bridge.listRemoteDirectories>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const next = await bridge.listRemoteDirectories(host, path);
        setListing(next);
        setPathInput(next.path);
      } catch (navigationError) {
        setError((navigationError as AppError).message);
      } finally {
        setLoading(false);
      }
    },
    [host],
  );

  useEffect(() => {
    void navigate(initialPath);
  }, [initialPath, navigate]);

  return (
    <div
      className="dialog-backdrop remote-browser-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        className="remote-folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-folder-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="remote-folder-title">Open remote folder</h2>
            <span><Server aria-hidden="true" /> {host}</span>
          </div>
          <button type="button" aria-label="Close remote folder browser" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <form
          className="remote-path-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate(pathInput);
          }}
        >
          <input
            aria-label="Remote path"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
          />
          <button type="submit" disabled={loading}>Go</button>
        </form>
        <div className="remote-folder-list" aria-busy={loading}>
          {listing?.parent && (
            <button
              type="button"
              onClick={() => listing.parent && void navigate(listing.parent)}
            >
              <ArrowUp aria-hidden="true" />
              <span>..</span>
            </button>
          )}
          {listing?.directories.map((directory) => (
            <button type="button" onClick={() => void navigate(directory)} key={directory}>
              <Folder aria-hidden="true" />
              <span>{repositoryNameFromPath(directory)}</span>
            </button>
          ))}
          {loading && <p>Connecting and reading folders…</p>}
          {!loading && listing && listing.directories.length === 0 && <p>No child folders.</p>}
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <footer>
          <span className="remote-current-path" title={listing?.path ?? pathInput}>
            {listing?.path ?? pathInput}
          </span>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            onClick={() => listing && onChoose(listing.path)}
            disabled={!listing || loading}
          >
            Use this folder
          </button>
        </footer>
      </section>
    </div>
  );
}

function RepositoryMenu({
  menu,
  repository,
  refreshing,
  onRefresh,
  onPin,
  onRemove,
}: {
  menu: RepositoryContextMenu;
  repository: RepositoryRecord | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  if (!repository) return null;
  return (
    <div
      className="repository-context-menu"
      role="menu"
      aria-label={`${repository.displayName} actions`}
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw aria-hidden="true" />
        {refreshing ? "Refreshing…" : "Refresh repository"}
      </button>
      <button type="button" role="menuitem" onClick={onPin}>
        {repository.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
        {repository.pinned ? "Unpin repository" : "Pin repository"}
      </button>
      <span className="menu-separator" />
      <button type="button" role="menuitem" className="danger" onClick={onRemove} disabled={refreshing}>
        <Trash2 aria-hidden="true" />
        Remove from jjcat…
      </button>
    </div>
  );
}

function RemoveRepositoryDialog({
  repository,
  onClose,
  onConfirm,
}: {
  repository: RepositoryRecord;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-repository-title"
        aria-describedby="remove-repository-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <Trash2 aria-hidden="true" />
          <h2 id="remove-repository-title">Remove {repository.displayName}?</h2>
        </header>
        <p id="remove-repository-description">
          This removes the repository from jjcat’s list and cached view. Files on disk and the
          remote repository remain untouched.
        </p>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="danger" onClick={onConfirm}>Remove from jjcat</button>
        </footer>
      </section>
    </div>
  );
}

export default App;
