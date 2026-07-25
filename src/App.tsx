import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  ArrowDownToLine,
  Cable,
  CircleX,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FileDiff,
  Folder,
  FolderOpen,
  FolderGit2,
  GitBranch,
  GitPullRequestArrow,
  History,
  Laptop,
  ListX,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Server,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { bridge, isTauriRuntime } from "./bridge";
import { BookmarkLabels } from "./components/BookmarkLabels";
import { Brand } from "./components/Brand";
import { ChangeWorkspace } from "./components/ChangeWorkspace";
import { MutationDialog } from "./components/MutationDialog";
import { RepositoryQuickSwitcher } from "./components/RepositoryQuickSwitcher";
import { WorkspaceManager } from "./components/WorkspaceManager";
import { filterChanges, type HistoryView } from "./lib/changeFilters";
import { isStale, locationLabel, relativeTime } from "./lib/format";
import { repositoryNavigation as navigationForProjection } from "./lib/repositoryNavigation";
import { groupRepositories } from "./lib/repositories";
import { failureBackoffMs, planRepositoryRefreshes } from "./lib/refreshScheduler";
import { historyShortcutFor } from "./lib/historyShortcuts";
import {
  tabOverflowState,
  tabScrollPage,
  type TabOverflowState,
} from "./lib/tabOverflow";
import {
  reorderRepositoryTabs,
  type RepositoryTabDropEdge,
} from "./lib/repositoryTabs";
import type {
  AppError,
  CachedProjection,
  ChangeRow,
  DiffViewMode,
  FileDiffProjection,
  InspectorView,
  OperationLogProjection,
  MutationExecution,
  MutationIntent,
  Registry,
  RepositoryDraft,
  RepositoryRecord,
  SyncStatus,
  WhitespaceMode,
} from "./types";

type RepositoryState =
  | "ready"
  | "cached"
  | "stale"
  | "refreshing"
  | "disconnected"
  | "disconnected-cached"
  | "empty";
type RepositoryContextMenu = { repositoryId: string; x: number; y: number };
type RepositoryTabDropTarget = {
  repositoryId: string;
  edge: RepositoryTabDropEdge;
};
type RepositoryTabPointerDrag = {
  repositoryId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};
type MutationDialogState = {
  initialIntent: MutationIntent;
  previewImmediately: boolean;
};
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";
const RESIZE_DIRECTIONS: ResizeDirection[] = [
  "North",
  "NorthEast",
  "East",
  "SouthEast",
  "South",
  "SouthWest",
  "West",
  "NorthWest",
];

function isTextEntry(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function startWindowDrag(event: React.PointerEvent<HTMLElement>) {
  if (!isTauriRuntime || event.button !== 0 || event.detail > 1) return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest("button, input, select, textarea, a, [role='button']")
  ) {
    return;
  }
  event.preventDefault();
  void getCurrentWindow().startDragging().catch(() => undefined);
}

function WindowResizeHandles() {
  if (!isTauriRuntime) return null;
  return (
    <div className="window-resize-handles" aria-hidden="true">
      {RESIZE_DIRECTIONS.map((direction) => (
        <span
          className={`window-resize-handle resize-${direction.toLowerCase()}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            void getCurrentWindow()
              .startResizeDragging(direction)
              .catch(() => undefined);
          }}
          key={direction}
        />
      ))}
    </div>
  );
}

function SyncSummary({ sync, conflicts }: { sync?: SyncStatus; conflicts: number }) {
  const state = sync ?? {
    available: false,
    remoteHeads: 0,
    outgoing: 0,
    behind: 0,
    basis: "lastFetched" as const,
  };
  return (
    <div
      className="sync-summary"
      aria-label={
        state.available
          ? `Remote state from last fetch: ${state.outgoing} outgoing, ${state.behind} behind, ${conflicts} conflicts`
          : `No fetched network remote state; ${conflicts} conflicts`
      }
      title="Remote comparison uses locally stored refs from the last fetch. It does not contact the network."
    >
      {conflicts > 0 && <strong className="sync-conflict">{conflicts} conflict</strong>}
      {state.available ? (
        <>
          <strong className="sync-outgoing">↑ {state.outgoing}</strong>
          <strong className="sync-behind">↓ {state.behind}</strong>
          <span>Last fetched</span>
        </>
      ) : (
        <span>No fetched remote</span>
      )}
    </div>
  );
}

function App() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failureCounts, setFailureCounts] = useState<Record<string, number>>({});
  const [retryAt, setRetryAt] = useState<Record<string, number>>({});
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedChangeDetails, setSelectedChangeDetails] = useState<ChangeRow | null>(null);
  const [changeDetailsLoading, setChangeDetailsLoading] = useState(false);
  const [changeDetailsError, setChangeDetailsError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiffProjection | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("unified");
  const [whitespaceMode, setWhitespaceMode] = useState<WhitespaceMode>("preserve");
  const [inspectorView, setInspectorView] = useState<InspectorView>("overview");
  const [operationLog, setOperationLog] = useState<OperationLogProjection | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>("all");
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenu | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RepositoryRecord | null>(null);
  const [repositoryActionError, setRepositoryActionError] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [mutationDialog, setMutationDialog] = useState<MutationDialogState | null>(null);
  const [historyStepExecuting, setHistoryStepExecuting] = useState<
    "undo" | "redo" | null
  >(null);
  const [rebaseSourceCommitId, setRebaseSourceCommitId] = useState<string | null>(null);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropTarget, setTabDropTarget] =
    useState<RepositoryTabDropTarget | null>(null);
  const [tabOverflow, setTabOverflow] = useState<TabOverflowState>({
    left: false,
    right: false,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const refreshingRef = useRef<Record<string, string>>({});
  const failureCountsRef = useRef<Record<string, number>>({});
  const cancelledRefreshesRef = useRef<Set<string>>(new Set());
  const changeDetailsRequestRef = useRef(0);
  const diffRequestRef = useRef(0);
  const operationRequestRef = useRef(0);
  const historyStepExecutingRef = useRef(false);
  const tabOrderSavingRef = useRef(false);
  const tabPointerDragRef = useRef<RepositoryTabPointerDrag | null>(null);
  const suppressTabClickRef = useRef(false);

  const updateTabOverflow = useCallback(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const next = tabOverflowState(
      tabs.scrollLeft,
      tabs.clientWidth,
      tabs.scrollWidth,
    );
    setTabOverflow((current) =>
      current.left === next.left && current.right === next.right ? current : next,
    );
  }, []);

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
  const repositoryNavigation = useMemo(
    () => navigationForProjection(selectedProjection),
    [selectedProjection],
  );
  const visibleChanges = useMemo(() => {
    return filterChanges(selectedProjection?.changes ?? [], historyView, searchQuery);
  }, [historyView, searchQuery, selectedProjection]);
  const selectedSummaryChange = useMemo(() => {
    return (
      visibleChanges.find((change) => change.changeId === selectedChangeId) ?? visibleChanges[0]
    );
  }, [selectedChangeId, visibleChanges]);
  const selectedChange = useMemo(() => {
    if (
      selectedChangeDetails?.changeId === selectedSummaryChange?.changeId &&
      selectedChangeDetails?.commitId === selectedSummaryChange?.commitId
    ) {
      return selectedChangeDetails;
    }
    return selectedSummaryChange;
  }, [selectedChangeDetails, selectedSummaryChange]);
  const selectedDetailsAvailable = Boolean(
    selectedChangeDetails &&
      selectedSummaryChange &&
      selectedChangeDetails.changeId === selectedSummaryChange.changeId &&
      selectedChangeDetails.commitId === selectedSummaryChange.commitId,
  );

  useEffect(() => {
    setSelectedChangeId(null);
    setSearchQuery("");
    setHistoryView("all");
    setShowWorkspaceManager(false);
    setInspectorView("overview");
    setMutationDialog(null);
    setRebaseSourceCommitId(null);
  }, [selectedRepository?.id]);

  useEffect(() => {
    const repositoryId = selectedRepository?.id;
    const changeId = selectedSummaryChange?.changeId;
    const commitId = selectedSummaryChange?.commitId;
    changeDetailsRequestRef.current += 1;
    setSelectedChangeDetails((current) =>
      current?.changeId === changeId && current?.commitId === commitId
        ? current
        : null,
    );
    setChangeDetailsError(null);
    if (!repositoryId || !changeId || !commitId) {
      setChangeDetailsLoading(false);
      return;
    }
    const request = changeDetailsRequestRef.current;
    setChangeDetailsLoading(true);
    bridge
      .loadChangeDetails(repositoryId, changeId, commitId)
      .then((details) => {
        if (request === changeDetailsRequestRef.current) {
          setSelectedChangeDetails(details);
        }
      })
      .catch((error: AppError) => {
        if (request === changeDetailsRequestRef.current) {
          setChangeDetailsError(error.message);
        }
      })
      .finally(() => {
        if (request === changeDetailsRequestRef.current) {
          setChangeDetailsLoading(false);
        }
      });
    return () => {
      if (request === changeDetailsRequestRef.current) {
        changeDetailsRequestRef.current += 1;
      }
    };
  }, [
    selectedRepository?.id,
    selectedSummaryChange?.changeId,
    selectedSummaryChange?.commitId,
    selectedProjection?.refreshedAt,
  ]);

  useEffect(() => {
    diffRequestRef.current += 1;
    setSelectedFilePath(null);
    setFileDiff(null);
    setDiffLoading(false);
    setDiffError(null);
  }, [selectedRepository?.id, selectedChange?.changeId, selectedChange?.commitId]);

  useEffect(() => {
    if (
      historyView !== "working-copy" ||
      selectedFilePath ||
      !selectedDetailsAvailable
    ) {
      return;
    }
    const firstFile = selectedChangeDetails?.files[0];
    if (firstFile) setSelectedFilePath(firstFile.path);
  }, [
    historyView,
    selectedChangeDetails,
    selectedDetailsAvailable,
    selectedFilePath,
  ]);

  useEffect(() => {
    operationRequestRef.current += 1;
    setOperationLog(null);
    setOperationLoading(false);
    setOperationError(null);
  }, [selectedRepository?.id]);

  useEffect(() => {
    if (!selectedRepository || !selectedChange || !selectedFilePath) return;
    const request = ++diffRequestRef.current;
    setFileDiff(null);
    setDiffLoading(true);
    setDiffError(null);
    bridge
      .loadFileDiff({
        repositoryId: selectedRepository.id,
        changeId: selectedChange.changeId,
        commitId: selectedChange.commitId,
        path: selectedFilePath,
        whitespaceMode,
      })
      .then((projection) => {
        if (request === diffRequestRef.current) setFileDiff(projection);
      })
      .catch((error: AppError) => {
        if (request === diffRequestRef.current) setDiffError(error.message);
      })
      .finally(() => {
        if (request === diffRequestRef.current) setDiffLoading(false);
      });
    return () => {
      if (request === diffRequestRef.current) diffRequestRef.current += 1;
    };
  }, [selectedChange, selectedFilePath, selectedRepository, whitespaceMode]);

  useEffect(() => {
    if (!selectedRepository) return;
    const request = ++operationRequestRef.current;
    setOperationLoading(true);
    setOperationError(null);
    bridge
      .loadOperationLog(selectedRepository.id)
      .then((projection) => {
        if (request === operationRequestRef.current) setOperationLog(projection);
      })
      .catch((error: AppError) => {
        if (request === operationRequestRef.current) setOperationError(error.message);
      })
      .finally(() => {
        if (request === operationRequestRef.current) setOperationLoading(false);
      });
    return () => {
      if (request === operationRequestRef.current) operationRequestRef.current += 1;
    };
  }, [selectedCache?.cachedAt, selectedRepository]);

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
    const tabs = tabsRef.current;
    if (!tabs) return;

    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(tabs);
    tabs.addEventListener("scroll", updateTabOverflow, { passive: true });
    const frame = window.requestAnimationFrame(updateTabOverflow);

    return () => {
      window.cancelAnimationFrame(frame);
      tabs.removeEventListener("scroll", updateTabOverflow);
      observer.disconnect();
    };
  }, [registry?.openRepositoryIds, updateTabOverflow]);

  useEffect(() => {
    const tabs = tabsRef.current;
    const repositoryId = registry?.selectedRepository;
    if (!tabs || !repositoryId) return;

    const frame = window.requestAnimationFrame(() => {
      const selectedTab = Array.from(
        tabs.querySelectorAll<HTMLElement>("[data-repository-tab-id]"),
      ).find((tab) => tab.dataset.repositoryTabId === repositoryId);
      if (!selectedTab) return;

      const tabLeft = selectedTab.offsetLeft;
      const tabRight = tabLeft + selectedTab.offsetWidth;
      if (tabLeft < tabs.scrollLeft) {
        tabs.scrollTo({ left: tabLeft, behavior: "smooth" });
      } else if (tabRight > tabs.scrollLeft + tabs.clientWidth) {
        tabs.scrollTo({
          left: tabRight - tabs.clientWidth,
          behavior: "smooth",
        });
      }
      updateTabOverflow();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [registry?.openRepositoryIds, registry?.selectedRepository, updateTabOverflow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        if (selectedRepository) void refreshRepository(selectedRepository.id);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (!searchInputRef.current) return;
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSwitcher(true);
      }
      const historyShortcut =
        !isTextEntry(event.target) && !mutationDialog
          ? historyShortcutFor(event)
          : null;
      if (historyShortcut === "redo" && operationLog?.redoTarget) {
        event.preventDefault();
        void executeHistoryStep("redo", operationLog.redoTarget);
      } else if (historyShortcut === "undo" && operationLog?.undoTarget) {
        event.preventDefault();
        void executeHistoryStep("undo", operationLog.undoTarget);
      }
      if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
        const repositoryId = registry?.openRepositoryIds[Number(event.key) - 1];
        if (repositoryId) {
          event.preventDefault();
          void selectRepository(repositoryId);
        }
      }
      if (
        event.altKey &&
        event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !isTextEntry(event.target) &&
        selectedRepository
      ) {
        event.preventDefault();
        moveRepositoryTabWithKeyboard(
          selectedRepository.id,
          event.key === "ArrowLeft" ? -1 : 1,
        );
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "r" &&
        selectedChange &&
        !/^0+$/.test(selectedChange.commitId) &&
        !isTextEntry(event.target) &&
        !mutationDialog
      ) {
        event.preventDefault();
        setRebaseSourceCommitId(selectedChange.commitId);
        setMutationNotice(
          `Rebase source ${selectedChange.changeId}. Select a destination and press Enter.`,
        );
      }
      if (
        event.key === "Enter" &&
        rebaseSourceCommitId &&
        selectedChange &&
        selectedChange.commitId !== rebaseSourceCommitId &&
        !isTextEntry(event.target) &&
        !mutationDialog
      ) {
        event.preventDefault();
        setMutationDialog({
          initialIntent: {
            kind: "rebase",
            sourceCommitId: rebaseSourceCommitId,
            destinationCommitId: selectedChange.commitId,
          },
          previewImmediately: true,
        });
        setRebaseSourceCommitId(null);
      }
      if (event.key === "Escape" && rebaseSourceCommitId && !mutationDialog) {
        setRebaseSourceCommitId(null);
        setMutationNotice(null);
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !isTextEntry(event.target)
      ) {
        const currentIndex = visibleChanges.findIndex(
          (change) => change.changeId === selectedChange?.changeId,
        );
        const nextIndex = Math.max(
          0,
          Math.min(
            visibleChanges.length - 1,
            currentIndex + (event.key === "ArrowDown" ? 1 : -1),
          ),
        );
        const next = visibleChanges[nextIndex];
        if (next && nextIndex !== currentIndex) {
          event.preventDefault();
          setSelectedChangeId(next.changeId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    refreshRepository,
    registry?.openRepositoryIds,
    selectRepository,
    selectedChange?.changeId,
    selectedRepository,
    visibleChanges,
    mutationDialog,
    operationLog?.redoTarget,
    operationLog?.undoTarget,
    rebaseSourceCommitId,
  ]);

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

  function mutationExecuted(execution: MutationExecution) {
    const cached: CachedProjection = {
      cachedAt: execution.projection.refreshedAt,
      projection: execution.projection,
    };
    setRegistry((current) =>
      current
        ? {
            ...current,
            cachedProjections: {
              ...current.cachedProjections,
              [execution.repositoryId]: cached,
            },
          }
        : current,
    );
    setFreshIds((current) => new Set(current).add(execution.repositoryId));
    setOperationLog(execution.operationLog);
    setSelectedChangeDetails(null);
    const workingCopy = execution.projection.changes.find(
      (change) => change.workingCopy,
    );
    setSelectedChangeId(workingCopy?.changeId ?? null);
    setMutationDialog(null);
    setRebaseSourceCommitId(null);
    setMutationNotice(execution.message);
    setRepositoryActionError(null);
  }

  async function executeHistoryStep(
    kind: "undo" | "redo",
    operationId: string,
  ) {
    if (!selectedRepository || historyStepExecutingRef.current) return;
    historyStepExecutingRef.current = true;
    setHistoryStepExecuting(kind);
    setRepositoryActionError(null);
    try {
      const preview = await bridge.previewMutation(selectedRepository.id, {
        kind,
        operationId,
      });
      const execution = await bridge.executeMutation({
        token: preview.token,
        confirmed: true,
        confirmation: null,
      });
      mutationExecuted(execution);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    } finally {
      historyStepExecutingRef.current = false;
      setHistoryStepExecuting(null);
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

  async function persistRepositoryTabOrder(
    sourceId: string,
    targetId: string,
    edge: RepositoryTabDropEdge,
  ) {
    if (!registry || tabOrderSavingRef.current) return;
    const reordered = reorderRepositoryTabs(
      registry.openRepositoryIds,
      sourceId,
      targetId,
      edge,
    );
    if (reordered === registry.openRepositoryIds) return;

    tabOrderSavingRef.current = true;
    try {
      const snapshot = await bridge.updateOpenRepositories(
        reordered,
        registry.selectedRepository,
      );
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    } finally {
      tabOrderSavingRef.current = false;
    }
  }

  function repositoryTabAtPointer(
    clientX: number,
    clientY: number,
  ): RepositoryTabDropTarget | null {
    const tab = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-repository-tab-id]");
    const repositoryId = tab?.dataset.repositoryTabId;
    if (!tab || !repositoryId) return null;
    const bounds = tab.getBoundingClientRect();
    const edge: RepositoryTabDropEdge =
      clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    return {
      repositoryId,
      edge,
    };
  }

  function resetRepositoryTabDrag() {
    tabPointerDragRef.current = null;
    setDraggedTabId(null);
    setTabDropTarget(null);
  }

  function moveRepositoryTabWithKeyboard(repositoryId: string, direction: -1 | 1) {
    if (!registry) return;
    const sourceIndex = registry.openRepositoryIds.indexOf(repositoryId);
    const targetId = registry.openRepositoryIds[sourceIndex + direction];
    if (!targetId) return;
    void persistRepositoryTabOrder(
      repositoryId,
      targetId,
      direction < 0 ? "before" : "after",
    );
  }

  function scrollRepositoryTabs(direction: -1 | 1) {
    const tabs = tabsRef.current;
    if (!tabs) return;
    tabs.scrollBy({
      left: direction * tabScrollPage(tabs.clientWidth),
      behavior: "smooth",
    });
  }

  if (fatalError) {
    return (
      <>
        <WindowResizeHandles />
        <div
          className="fallback-drag-strip"
          data-tauri-drag-region
          onPointerDown={startWindowDrag}
        />
        <main className="fatal-state">
          <CircleX aria-hidden="true" />
          <h1>jjcat could not start</h1>
          <p>{fatalError}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      </>
    );
  }

  if (!registry) {
    return (
      <>
        <WindowResizeHandles />
        <div
          className="fallback-drag-strip"
          data-tauri-drag-region
          onPointerDown={startWindowDrag}
        />
        <main className="loading-state">Loading repositories…</main>
      </>
    );
  }

  const openRepositories = registry.openRepositoryIds
    .map((id) => registry.repositories.find((repository) => repository.id === id))
    .filter((repository): repository is RepositoryRecord => Boolean(repository));
  const selectedState = selectedRepository
    ? repositoryState(selectedRepository.id, selectedCache, freshIds, refreshing, errors)
    : "empty";

  return (
    <main className="app-shell">
      <WindowResizeHandles />
      <header
        className="titlebar"
        data-tauri-drag-region
        onPointerDown={startWindowDrag}
      >
        <div className="traffic-lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Brand />
        <div
          className={[
            "tabs-shell",
            tabOverflow.left ? "has-overflow-left" : "",
            tabOverflow.right ? "has-overflow-right" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-tauri-drag-region
        >
          <nav
            ref={tabsRef}
            className="tabs"
            aria-label="Open repositories"
            data-tauri-drag-region
          >
            {openRepositories.map((repository, tabIndex) => {
            const state = repositoryState(
              repository.id,
              registry.cachedProjections[repository.id],
              freshIds,
              refreshing,
              errors,
            );
            const active = repository.id === selectedRepository?.id;
            const dropEdge =
              tabDropTarget?.repositoryId === repository.id
                ? tabDropTarget.edge
                : null;
            return (
              <div
                className={[
                  "tab",
                  active ? "active" : "",
                  draggedTabId === repository.id ? "dragging" : "",
                  dropEdge ? `drop-${dropEdge}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-repository-tab-id={repository.id}
                key={repository.id}
              >
                <button
                  type="button"
                  aria-label={`${repository.displayName} repository tab, position ${tabIndex + 1} of ${openRepositories.length}`}
                  title="Drag to reorder · Alt+Shift+Left/Right"
                  onClick={(event) => {
                    if (suppressTabClickRef.current) {
                      event.preventDefault();
                      suppressTabClickRef.current = false;
                      return;
                    }
                    void selectRepository(repository.id);
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || openRepositories.length < 2) return;
                    suppressTabClickRef.current = false;
                    tabPointerDragRef.current = {
                      repositoryId: repository.id,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const drag = tabPointerDragRef.current;
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    if (
                      !drag.moved &&
                      Math.hypot(
                        event.clientX - drag.startX,
                        event.clientY - drag.startY,
                      ) < 5
                    ) {
                      return;
                    }
                    drag.moved = true;
                    suppressTabClickRef.current = true;
                    event.preventDefault();
                    setDraggedTabId(drag.repositoryId);
                    const target = repositoryTabAtPointer(
                      event.clientX,
                      event.clientY,
                    );
                    setTabDropTarget(
                      target && target.repositoryId !== drag.repositoryId
                        ? target
                        : null,
                    );
                  }}
                  onPointerUp={(event) => {
                    const drag = tabPointerDragRef.current;
                    if (!drag || drag.pointerId !== event.pointerId) return;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    const target = drag.moved
                      ? repositoryTabAtPointer(event.clientX, event.clientY)
                      : null;
                    if (drag.moved) event.preventDefault();
                    resetRepositoryTabDrag();
                    if (target && target.repositoryId !== drag.repositoryId) {
                      void persistRepositoryTabOrder(
                        drag.repositoryId,
                        target.repositoryId,
                        target.edge,
                      );
                    }
                  }}
                  onPointerCancel={(event) => {
                    if (
                      tabPointerDragRef.current?.pointerId !== event.pointerId
                    ) {
                      return;
                    }
                    suppressTabClickRef.current = false;
                    resetRepositoryTabDrag();
                  }}
                >
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
          {tabOverflow.left ? (
            <button
              type="button"
              className="tab-scroll-control tab-scroll-left"
              aria-label="Scroll repository tabs left"
              title="More repository tabs to the left"
              onClick={() => scrollRepositoryTabs(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          {tabOverflow.right ? (
            <button
              type="button"
              className="tab-scroll-control tab-scroll-right"
              aria-label="Scroll repository tabs right"
              title="More repository tabs to the right"
              onClick={() => scrollRepositoryTabs(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
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
        <nav className="repository-navigation" aria-label="Repository views">
          <section className="navigation-section">
            <h3>Workspace</h3>
            <button
              type="button"
              className={!showWorkspaceManager && historyView === "working-copy" ? "selected" : ""}
              onClick={() => {
                setShowWorkspaceManager(false);
                setHistoryView("working-copy");
                setInspectorView("overview");
              }}
              disabled={!selectedRepository}
            >
              <FolderGit2 aria-hidden="true" />
              <span>Working Copy</span>
              <strong>{repositoryNavigation.workingCopyFiles}</strong>
            </button>
            <button
              type="button"
              className={showWorkspaceManager ? "selected" : ""}
              onClick={() => {
                setShowWorkspaceManager(true);
                setInspectorView("overview");
              }}
              disabled={!selectedRepository}
            >
              <FolderOpen aria-hidden="true" />
              <span>Workspaces</span>
              <strong>{selectedProjection?.workspaces.length ?? 0}</strong>
            </button>
            <button
              type="button"
              className={!showWorkspaceManager && historyView === "all" ? "selected" : ""}
              onClick={() => {
                setShowWorkspaceManager(false);
                setHistoryView("all");
                setInspectorView("overview");
              }}
              disabled={!selectedRepository}
            >
              <FileDiff aria-hidden="true" />
              <span>All Changes</span>
            </button>
          </section>
          <section className="navigation-section">
            <h3>Repository</h3>
            <button
              type="button"
              className={historyView === "conflicts" ? "selected" : ""}
              onClick={() => {
                setShowWorkspaceManager(false);
                setHistoryView("conflicts");
                setInspectorView("overview");
              }}
              disabled={!selectedRepository}
            >
              <AlertTriangle aria-hidden="true" />
              <span>Conflicts</span>
              <strong className={repositoryNavigation.conflicts > 0 ? "warning-count" : ""}>
                {repositoryNavigation.conflicts}
              </strong>
            </button>
            <button
              type="button"
              className={inspectorView === "operations" ? "selected" : ""}
              onClick={() => {
                setShowWorkspaceManager(false);
                setHistoryView("all");
                setInspectorView("operations");
              }}
              disabled={!selectedRepository}
            >
              <History aria-hidden="true" />
              <span>Operations</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setMutationDialog({
                  initialIntent: { kind: "pruneEmpty" },
                  previewImmediately: true,
                })
              }
              disabled={!selectedRepository}
            >
              <Trash2 aria-hidden="true" />
              <span>Prune Empty Changes…</span>
            </button>
          </section>
          {selectedProjection && (
            <section className="navigation-section navigation-sync" aria-label="Last fetched state">
              <h3>Last Fetched</h3>
              {selectedProjection.syncStatus.available ? (
                <p>
                  <span className="sync-outgoing">↑ {selectedProjection.syncStatus.outgoing}</span>
                  <span className="sync-behind">↓ {selectedProjection.syncStatus.behind}</span>
                  <small>{selectedProjection.syncStatus.remoteHeads} remote heads</small>
                </p>
              ) : (
                <p><small>No fetched remote state</small></p>
              )}
            </section>
          )}
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
                        x: Math.min(event.clientX, window.innerWidth - 220),
                        y: Math.min(event.clientY, window.innerHeight - 154),
                      });
                    }}
                    key={repository.id}
                  >
                    {repository.location.kind === "local" ? <Database aria-hidden="true" /> : <Server aria-hidden="true" />}
                    <span>{repository.displayName}</span>
                    {state !== "ready" && state !== "cached" && (
                      <span className={`repository-state ${state}`}>{compactStateLabel(state)}</span>
                    )}
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
        {mutationNotice && (
          <div className="notice mutation-notice" role="status">
            <GitPullRequestArrow aria-hidden="true" /> {mutationNotice}
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
              {selectedProjection && (
                <SyncSummary
                  sync={selectedProjection.syncStatus}
                  conflicts={selectedProjection.conflicts}
                />
              )}
              <div className="toolbar-controls">
                <div className="history-step-controls" aria-label="Operation history">
                  <button
                    type="button"
                    className="mutation-button history-step-button"
                    title="Undo one repository operation (⌘Z / Ctrl+Z)"
                    aria-label="Undo one repository operation"
                    onClick={() => {
                      if (!operationLog?.undoTarget) return;
                      void executeHistoryStep("undo", operationLog.undoTarget);
                    }}
                    disabled={!operationLog?.undoTarget || historyStepExecuting !== null}
                  >
                    <RotateCcw aria-hidden="true" />
                    <span>{historyStepExecuting === "undo" ? "Undoing…" : "Undo"}</span>
                  </button>
                  <button
                    type="button"
                    className="mutation-button history-step-button"
                    title="Redo one repository operation (⌘⇧Z / Ctrl+Y)"
                    aria-label="Redo one repository operation"
                    onClick={() => {
                      if (!operationLog?.redoTarget) return;
                      void executeHistoryStep("redo", operationLog.redoTarget);
                    }}
                    disabled={!operationLog?.redoTarget || historyStepExecuting !== null}
                  >
                    <RotateCw aria-hidden="true" />
                    <span>{historyStepExecuting === "redo" ? "Redoing…" : "Redo"}</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="mutation-button"
                  title="Create a new change on the selected change"
                  onClick={() => {
                    setShowWorkspaceManager(false);
                    if (!selectedChange) return;
                    setMutationDialog({
                      initialIntent: {
                        kind: "new",
                        parentCommitIds: [selectedChange.commitId],
                      },
                      previewImmediately: true,
                    });
                  }}
                  disabled={!selectedChange}
                >
                  <Plus aria-hidden="true" /> New
                </button>
                <button
                  type="button"
                  className="mutation-button"
                  title="Preview a network fetch"
                  onClick={() =>
                    setMutationDialog({
                      initialIntent: { kind: "fetch", remote: "origin" },
                      previewImmediately: true,
                    })
                  }
                >
                  <ArrowDownToLine aria-hidden="true" /> Fetch
                </button>
                <button
                  type="button"
                  className="mutation-button compact-prune-button"
                  title="Prune empty changes"
                  onClick={() =>
                    setMutationDialog({
                      initialIntent: { kind: "pruneEmpty" },
                      previewImmediately: true,
                    })
                  }
                >
                  <ListX aria-hidden="true" /> Prune
                </button>
                <button
                  type="button"
                  className="handoff-button"
                  title="Inspect read-only operation log"
                  aria-label="Inspect operation log"
                  onClick={() => {
                    setHistoryView("all");
                    setInspectorView("operations");
                  }}
                >
                  <History aria-hidden="true" />
                </button>
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
                {!showWorkspaceManager && historyView !== "working-copy" && (
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
                )}
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
            {showWorkspaceManager ? (
              <WorkspaceManager
                workspaces={selectedProjection?.workspaces ?? []}
                onReviewChange={(workspace) => {
                  setShowWorkspaceManager(false);
                  setHistoryView("all");
                  setInspectorView("overview");
                  setSelectedChangeId(workspace.changeId);
                }}
                onRemove={(workspace) =>
                  setMutationDialog({
                    initialIntent: {
                      kind: "removeWorkspace",
                      name: workspace.name,
                    },
                    previewImmediately: true,
                  })
                }
              />
            ) : (
            <ChangeWorkspace
              changes={visibleChanges}
              selectedChange={selectedChange}
              workingCopyMode={historyView === "working-copy"}
              compactHistory={
                historyView === "all" && searchQuery.trim().length === 0
              }
              workingCopyFileCount={repositoryNavigation.workingCopyFiles}
              onSelect={setSelectedChangeId}
              refreshing={selectedState === "refreshing"}
              changeDetailsLoading={changeDetailsLoading && !selectedDetailsAvailable}
              changeDetailsError={selectedDetailsAvailable ? null : changeDetailsError}
              selectedFilePath={selectedFilePath}
              diff={fileDiff}
              diffLoading={diffLoading}
              diffError={diffError}
              diffViewMode={diffViewMode}
              whitespaceMode={whitespaceMode}
              onDiffViewModeChange={setDiffViewMode}
              onWhitespaceModeChange={setWhitespaceMode}
              inspectorView={inspectorView}
              onInspectorViewChange={setInspectorView}
              operationLog={operationLog}
              operationLoading={operationLoading}
              operationError={operationError}
              historyStepExecuting={historyStepExecuting}
              rebaseSourceCommitId={rebaseSourceCommitId}
              onRequestRebase={(sourceCommitId, destinationCommitId) => {
                setMutationDialog({
                  initialIntent: {
                    kind: "rebase",
                    sourceCommitId,
                    destinationCommitId,
                  },
                  previewImmediately: true,
                });
                setRebaseSourceCommitId(null);
              }}
              onRequestUndo={(operationId) =>
                void executeHistoryStep("undo", operationId)
              }
              onRequestRedo={(operationId) =>
                void executeHistoryStep("redo", operationId)
              }
              onLaunchMutation={({ intent, previewImmediately }) =>
                setMutationDialog({
                  initialIntent: intent,
                  previewImmediately,
                })
              }
              onSelectFile={(path) => {
                setSelectedFilePath(path);
                setInspectorView("changes");
              }}
            />
            )}
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
          onPrune={() => {
            const repositoryId = contextMenu.repositoryId;
            setContextMenu(null);
            void selectRepository(repositoryId).then(() =>
              setMutationDialog({
                initialIntent: { kind: "pruneEmpty" },
                previewImmediately: true,
              }),
            );
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
      {mutationDialog && selectedRepository && (
        <MutationDialog
          repositoryId={selectedRepository.id}
          repositoryName={selectedRepository.displayName}
          changes={selectedProjection?.changes ?? []}
          selectedChange={selectedChange}
          initialIntent={mutationDialog.initialIntent}
          previewImmediately={mutationDialog.previewImmediately}
          onClose={() => setMutationDialog(null)}
          onExecuted={mutationExecuted}
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
      return "Unavailable";
    case "disconnected-cached":
      return "Refresh failed · Cached";
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
      return "Unavailable";
    case "disconnected-cached":
      return "Refresh failed";
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
  onPrune,
  onRemove,
}: {
  menu: RepositoryContextMenu;
  repository: RepositoryRecord | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onPin: () => void;
  onPrune: () => void;
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
      <button type="button" role="menuitem" onClick={onPrune} disabled={refreshing}>
        <ListX aria-hidden="true" />
        Prune empty changes…
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
