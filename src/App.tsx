import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  Unplug,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appUpdater } from "./appUpdater";
import { bridge, isTauriRuntime } from "./bridge";
import { ActivityCenter } from "./components/ActivityCenter";
import { BookmarkLabels } from "./components/BookmarkLabels";
import { Brand } from "./components/Brand";
import { ChangeWorkspace } from "./components/ChangeWorkspace";
import { CliSpinner } from "./components/CliSpinner";
import { adjacentNavigationIndex } from "./lib/keyboardNavigation";
import { toggleDiffQuickLookWindow } from "./lib/diffQuickLook";
import { openFileTimelineWindow } from "./lib/fileTimeline";
import { AddRepositorySourceDialog } from "./components/AddRepositorySourceDialog";
import { MutationDialog } from "./components/MutationDialog";
import { RepositoryQuickSwitcher } from "./components/RepositoryQuickSwitcher";
import { RepositoryRefreshNotice } from "./components/RepositoryRefreshNotice";
import { RepositorySourceTree } from "./components/RepositorySourceTree";
import { WorkspaceManager } from "./components/WorkspaceManager";
import { filterChanges, type HistoryView } from "./lib/changeFilters";
import {
  appendActivity,
  finishActivity,
  type ActivityCategory,
  type ActivityEntry,
} from "./lib/activity";
import {
  appUpdateActionModel,
  canCheckForAppUpdate,
  reduceAppUpdate,
  type AppUpdateEvent,
  type AppUpdateState,
} from "./lib/appUpdate";
import { createAppUpdateFocusScheduler } from "./lib/appUpdateFocusScheduler";
import {
  jjGitInitializationCommands,
  jjMutationCommands,
} from "./lib/jjCommand";
import { locationLabel, relativeTime } from "./lib/format";
import { useDiffViewerPreferences } from "./lib/useDiffViewerPreferences";
import { useTransientNotice } from "./lib/useTransientNotice";
import {
  compactStateLabel,
  isDisconnectedState,
  repositoryState,
  stateLabel,
  type RepositoryState,
} from "./lib/repositoryStatus";
import { repositoryNavigation as navigationForProjection } from "./lib/repositoryNavigation";
import { repositoryTabPresentations } from "./lib/repositories";
import {
  repositoryReadiness,
  standaloneRepositories,
} from "./lib/repositorySources";
import { failureBackoffMs, planRepositoryRefreshes } from "./lib/refreshScheduler";
import { historyShortcutFor } from "./lib/historyShortcuts";
import {
  anchoredPopupPosition,
  type PopupPosition,
} from "./lib/popupPosition";
import {
  tabOverflowState,
  tabScrollPage,
  type TabOverflowState,
} from "./lib/tabOverflow";
import {
  adjacentRepositoryTabId,
  reorderRepositoryTabs,
  repositoryTabCycleDirection,
  type RepositoryTabDropEdge,
} from "./lib/repositoryTabs";
import type {
  AppError,
  CachedProjection,
  ChangeRow,
  FileDiffProjection,
  InspectorView,
  OperationLogProjection,
  MutationExecution,
  MutationIntent,
  MutationKind,
  Registry,
  RepositoryDraft,
  RepositoryLocation,
  RepositoryRecord,
  RepositorySourceDraft,
  RepositorySourceRecord,
  SyncStatus,
} from "./types";

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
type GitOnboardingTarget =
  | {
      kind: "registered";
      repositoryId: string;
      displayName: string;
      location: RepositoryLocation;
    }
  | {
      kind: "discovered";
      sourceId: string;
      relativePath: string;
      displayName: string;
      location: RepositoryLocation;
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

const MUTATION_ACTIVITY_DETAILS: Record<MutationKind, string> = {
  new: "Create a new working-copy change",
  edit: "Move the working copy to the selected change",
  describe: "Update the selected change description",
  fetch: "Contact the selected Git remote",
  rebase: "Rebase the selected change onto a new parent",
  squash: "Squash the selected change into its destination",
  split: "Split selected paths into a new change",
  abandon: "Abandon the selected change",
  pruneEmpty: "Prune eligible empty changes",
  removeWorkspace: "Remove the selected workspace and directory",
  undo: "Restore the previous repository operation",
  redo: "Restore the next repository operation",
  bookmarkMove: "Move the selected bookmark",
  push: "Push the selected bookmark",
};

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
  const [errors, setErrors] = useState<Record<string, AppError>>({});
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
  const {
    viewMode: diffViewMode,
    whitespaceMode,
    setViewMode: setDiffViewMode,
    setWhitespaceMode,
  } = useDiffViewerPreferences();
  const [inspectorView, setInspectorView] = useState<InspectorView>("changes");
  const keyboardNavigationZoneRef = useRef<
    "graph" | "files" | "diff" | "operations"
  >("graph");
  const [operationLog, setOperationLog] = useState<OperationLogProjection | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>("all");
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [railAddMenuPosition, setRailAddMenuPosition] =
    useState<PopupPosition | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [gitOnboardingTarget, setGitOnboardingTarget] =
    useState<GitOnboardingTarget | null>(null);
  const [gitOnboardingRunning, setGitOnboardingRunning] = useState(false);
  const [gitOnboardingError, setGitOnboardingError] = useState<string | null>(
    null,
  );
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenu | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RepositoryRecord | null>(null);
  const [removeSourceTarget, setRemoveSourceTarget] =
    useState<RepositorySourceRecord | null>(null);
  const [scanningSources, setScanningSources] = useState<Set<string>>(new Set());
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [repositoryActionError, setRepositoryActionError] = useState<string | null>(null);
  const [handoffNotice, showHandoffNotice] = useTransientNotice();
  const [mutationDialog, setMutationDialog] = useState<MutationDialogState | null>(null);
  const [historyStepExecuting, setHistoryStepExecuting] = useState<
    "undo" | "redo" | null
  >(null);
  const [rebaseSourceCommitId, setRebaseSourceCommitId] = useState<string | null>(null);
  const [rebaseSelectionNotice, setRebaseSelectionNotice] = useState<string | null>(
    null,
  );
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [activityCenterOpen, setActivityCenterOpen] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [appUpdate, dispatchAppUpdate] = useReducer(reduceAppUpdate, {
    phase: "idle",
  });
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropTarget, setTabDropTarget] =
    useState<RepositoryTabDropTarget | null>(null);
  const [tabOverflow, setTabOverflow] = useState<TabOverflowState>({
    left: false,
    right: false,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const registryRef = useRef<Registry | null>(null);
  const railAddMenuRef = useRef<HTMLDivElement>(null);
  const railAddButtonRef = useRef<HTMLButtonElement>(null);
  const railAddPopupRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const refreshingRef = useRef<Record<string, string>>({});
  const failureCountsRef = useRef<Record<string, number>>({});
  const cancelledRefreshesRef = useRef<Set<string>>(new Set());
  const refreshActivityIdsRef = useRef<Record<string, string>>({});
  const changeDetailsRequestRef = useRef(0);
  const diffRequestRef = useRef(0);
  const operationRequestRef = useRef(0);
  const repositorySelectionRequestRef = useRef(0);
  const historyStepExecutingRef = useRef(false);
  const appUpdateCheckInFlightRef = useRef(false);
  const appUpdateManualCheckRef = useRef(false);
  const appUpdateLastCheckAttemptAtRef = useRef<number | null>(null);
  const appUpdateStateRef = useRef<AppUpdateState>({ phase: "idle" });
  const tabOrderSavingRef = useRef(false);
  const tabPointerDragRef = useRef<RepositoryTabPointerDrag | null>(null);
  const suppressTabClickRef = useRef(false);

  useEffect(() => {
    registryRef.current = registry;
  }, [registry]);

  useEffect(() => {
    appUpdateStateRef.current = appUpdate;
  }, [appUpdate]);

  const dispatchAppUpdateEvent = useCallback((event: AppUpdateEvent) => {
    appUpdateStateRef.current = reduceAppUpdate(appUpdateStateRef.current, event);
    dispatchAppUpdate(event);
  }, []);

  const startActivity = useCallback(
    ({
      repositoryId,
      repositoryName,
      title,
      detail,
      commands = [],
      category,
      cancellable = false,
      requestId = null,
    }: {
      repositoryId: string;
      repositoryName: string;
      title: string;
      detail: string;
      commands?: string[];
      category: ActivityCategory;
      cancellable?: boolean;
      requestId?: string | null;
    }) => {
      const id = crypto.randomUUID();
      const entry: ActivityEntry = {
        id,
        repositoryId,
        repositoryName,
        title,
        detail,
        commands,
        category,
        state: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        outcome: null,
        cancellable,
        requestId,
      };
      setActivities((current) => appendActivity(current, entry));
      return id;
    },
    [],
  );

  const completeActivity = useCallback(
    (
      id: string,
      state: "waiting" | "success" | "failed" | "cancelled",
      outcome: string,
    ) => {
      setActivities((current) =>
        finishActivity(current, id, state, outcome, new Date().toISOString()),
      );
    },
    [],
  );

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

  const checkForAppUpdate = useCallback(async (manual: boolean) => {
    if (!canCheckForAppUpdate(appUpdateStateRef.current)) return;
    if (appUpdateCheckInFlightRef.current) {
      if (manual) {
        appUpdateManualCheckRef.current = true;
        dispatchAppUpdateEvent({ type: "checkStarted", manual: true });
      }
      return;
    }
    appUpdateCheckInFlightRef.current = true;
    appUpdateManualCheckRef.current = manual;
    appUpdateLastCheckAttemptAtRef.current = Date.now();
    dispatchAppUpdateEvent({ type: "checkStarted", manual });
    try {
      const update = await appUpdater.check();
      dispatchAppUpdateEvent({ type: "checkCompleted", update });
    } catch {
      dispatchAppUpdateEvent({
        type: "checkFailed",
        manual: appUpdateManualCheckRef.current,
      });
    } finally {
      appUpdateCheckInFlightRef.current = false;
      appUpdateManualCheckRef.current = false;
    }
  }, [dispatchAppUpdateEvent]);

  const downloadAppUpdate = useCallback(async () => {
    dispatchAppUpdateEvent({ type: "downloadStarted" });
    try {
      await appUpdater.downloadAndInstall((chunkLength, contentLength) => {
        dispatchAppUpdateEvent({
          type: "downloadProgress",
          chunkLength,
          contentLength,
        });
      });
      dispatchAppUpdateEvent({ type: "downloadCompleted" });
    } catch {
      dispatchAppUpdateEvent({ type: "downloadFailed" });
    }
  }, [dispatchAppUpdateEvent]);

  const restartAfterAppUpdate = useCallback(async () => {
    try {
      await appUpdater.restart();
    } catch {
      dispatchAppUpdateEvent({ type: "restartFailed" });
    }
  }, [dispatchAppUpdateEvent]);

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

  useEffect(() => {
    let disposed = false;
    let unlistenManualCheck: (() => void) | null = null;
    let unlistenFocus: (() => void) | null = null;
    const focusScheduler = createAppUpdateFocusScheduler({
      getLastCheckAttemptAt: () => appUpdateLastCheckAttemptAtRef.current,
      check: () => {
        void checkForAppUpdate(false);
      },
    });

    const startupTimer = window.setTimeout(() => {
      void checkForAppUpdate(false);
    }, 1_000);
    void appUpdater.onManualCheck(() => {
      void checkForAppUpdate(true);
    })
      .then((nextUnlisten) => {
        if (disposed) nextUnlisten();
        else unlistenManualCheck = nextUnlisten;
      })
      .catch(() => undefined);
    if (isTauriRuntime) {
      void getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          focusScheduler.focusChanged(focused);
        })
        .then((nextUnlisten) => {
          if (disposed) nextUnlisten();
          else unlistenFocus = nextUnlisten;
        })
        .catch(() => undefined);
    }
    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      focusScheduler.dispose();
      unlistenManualCheck?.();
      unlistenFocus?.();
    };
  }, [checkForAppUpdate]);

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
    setInspectorView("changes");
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
      const repository = registryRef.current?.repositories.find(
        (candidate) => candidate.id === repositoryId,
      );
      if (repository && repositoryReadiness(repository) === "gitOnly") {
        setGitOnboardingError(null);
        setGitOnboardingTarget({
          kind: "registered",
          repositoryId: repository.id,
          displayName: repository.displayName,
          location: repository.location,
        });
        return;
      }
      const request = ++repositorySelectionRequestRef.current;
      try {
        const snapshot = await bridge.selectRepository(repositoryId);
        if (request !== repositorySelectionRequestRef.current) return;
        setRegistry(snapshot.registry);
        setRecoveryNotice(snapshot.recoveryNotice);
        setRepositoryActionError(null);
      } catch (error) {
        if (request !== repositorySelectionRequestRef.current) return;
        setRepositoryActionError((error as AppError).message);
      }
    },
    [],
  );

  const refreshRepository = useCallback(
    async (
      repositoryId: string,
      cancelActive = true,
      category: ActivityCategory = "user",
    ) => {
      if (!registry) return;
      const activeRequest = refreshingRef.current[repositoryId];
      if (activeRequest) {
        if (cancelActive) {
          cancelledRefreshesRef.current.add(activeRequest);
          const activityId = refreshActivityIdsRef.current[activeRequest];
          if (activityId) {
            completeActivity(
              activityId,
              "cancelled",
              "Repository refresh was cancelled.",
            );
            delete refreshActivityIdsRef.current[activeRequest];
          }
          await bridge.cancelRefresh(activeRequest);
        }
        return;
      }
      const repository = registry.repositories.find(
        (candidate) => candidate.id === repositoryId,
      );
      if (!repository) return;
      const requestId = crypto.randomUUID();
      const activityId = startActivity({
        repositoryId,
        repositoryName: repository.displayName,
        title: "Refresh repository",
        detail: "Refresh the local repository projection",
        category,
        cancellable: true,
        requestId,
      });
      refreshActivityIdsRef.current[requestId] = activityId;
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
        completeActivity(
          activityId,
          "success",
          "Repository projection refreshed.",
        );
      } catch (error) {
        if (cancelledRefreshesRef.current.delete(requestId)) return;
        const appError = error as AppError;
        setErrors((current) => ({ ...current, [repositoryId]: appError }));
        const nextFailureCount = (failureCountsRef.current[repositoryId] ?? 0) + 1;
        failureCountsRef.current[repositoryId] = nextFailureCount;
        setFailureCounts((current) => ({ ...current, [repositoryId]: nextFailureCount }));
        setRetryAt((current) => ({
          ...current,
          [repositoryId]: Date.now() + failureBackoffMs(nextFailureCount),
        }));
        completeActivity(
          activityId,
          appError.kind === "busy" ? "waiting" : "failed",
          appError.kind === "busy"
            ? "Refresh will retry after the active repository operation."
            : "Repository refresh failed. See the repository notice for details.",
        );
      } finally {
        delete refreshActivityIdsRef.current[requestId];
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
    [completeActivity, registry, startActivity],
  );

  const cancelActivity = useCallback(
    async (entry: ActivityEntry) => {
      if (!entry.requestId || entry.state !== "running") return;
      cancelledRefreshesRef.current.add(entry.requestId);
      completeActivity(
        entry.id,
        "cancelled",
        "Repository refresh was cancelled.",
      );
      delete refreshActivityIdsRef.current[entry.requestId];
      await bridge.cancelRefresh(entry.requestId);
    },
    [completeActivity],
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
    void refreshRepository(selectedRepository.id, false, "background");
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
      window.setTimeout(
        () => void refreshRepository(repositoryId, false, "background"),
        delayMs,
      ),
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
    const rememberKeyboardNavigationZone = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const zone = target
        .closest<HTMLElement>("[data-keyboard-navigation]")
        ?.dataset.keyboardNavigation;
      if (
        zone === "graph" ||
        zone === "files" ||
        zone === "diff" ||
        zone === "operations"
      ) {
        keyboardNavigationZoneRef.current = zone;
      }
    };
    window.addEventListener(
      "pointerdown",
      rememberKeyboardNavigationZone,
      true,
    );
    return () =>
      window.removeEventListener(
        "pointerdown",
        rememberKeyboardNavigationZone,
        true,
      );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (activityCenterOpen) return;
      const tabCycleDirection =
        !mutationDialog ? repositoryTabCycleDirection(event) : null;
      if (tabCycleDirection && registry) {
        event.preventDefault();
        const repositoryId = adjacentRepositoryTabId(
          registry.openRepositoryIds,
          registry.selectedRepository,
          tabCycleDirection,
        );
        if (repositoryId) {
          void selectRepository(repositoryId);
        }
      }
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
        !event.defaultPrevented &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key === " " ||
          event.key === "Spacebar" ||
          event.code === "Space") &&
        keyboardNavigationZoneRef.current === "files" &&
        selectedRepository &&
        selectedChange &&
        selectedFilePath &&
        inspectorView === "changes" &&
        !isTextEntry(event.target) &&
        !mutationDialog
      ) {
        event.preventDefault();
        void toggleDiffQuickLookWindow({
          repositoryId: selectedRepository.id,
          repositoryName: selectedRepository.displayName,
          changeId: selectedChange.changeId,
          commitId: selectedChange.commitId,
          selectedFilePath,
          viewMode: diffViewMode,
          whitespaceMode,
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          setRepositoryActionError(message);
        });
      }
      if (
        !event.defaultPrevented &&
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
        setRebaseSelectionNotice(
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
        setRebaseSelectionNotice(null);
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !isTextEntry(event.target) &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            '[data-keyboard-navigation="files"], [data-keyboard-navigation="diff"], [data-keyboard-navigation="operations"]',
          )
        )
      ) {
        const currentIndex = visibleChanges.findIndex(
          (change) => change.changeId === selectedChange?.changeId,
        );
        const nextIndex = adjacentNavigationIndex(
          visibleChanges.length,
          currentIndex,
          event.key === "ArrowDown" ? 1 : -1,
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
    activityCenterOpen,
    refreshRepository,
    registry?.openRepositoryIds,
    registry?.selectedRepository,
    selectRepository,
    selectedChange?.changeId,
    selectedChange?.commitId,
    selectedFilePath,
    selectedRepository,
    visibleChanges,
    diffViewMode,
    inspectorView,
    mutationDialog,
    operationLog?.redoTarget,
    operationLog?.undoTarget,
    rebaseSourceCommitId,
    whitespaceMode,
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

  useEffect(() => {
    if (!showAddMenu) return;
    const updatePosition = () => {
      const anchor = railAddButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setRailAddMenuPosition(
        anchoredPopupPosition({
          anchor: {
            left: anchor.left,
            top: anchor.top,
            bottom: anchor.bottom,
          },
          popupWidth: 242,
          popupHeight: 108,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !railAddMenuRef.current?.contains(event.target) &&
        !railAddPopupRef.current?.contains(event.target)
      ) {
        setShowAddMenu(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAddMenu(false);
    };
    updatePosition();
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [showAddMenu]);

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

  async function scanRepositorySource(sourceId: string) {
    const source = registry?.repositorySources.find(
      (candidate) => candidate.id === sourceId,
    );
    const activityId = startActivity({
      repositoryId: sourceId,
      repositoryName: source?.displayName ?? "Repository source",
      title: "Scan repository source",
      detail: "Discover repositories below the registered source",
      category: "user",
    });
    setScanningSources((current) => new Set(current).add(sourceId));
    setSourceErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    try {
      const snapshot = await bridge.scanRepositorySource(sourceId);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      completeActivity(
        activityId,
        "success",
        "Repository source scan completed.",
      );
    } catch (error) {
      setSourceErrors((current) => ({
        ...current,
        [sourceId]: (error as AppError).message,
      }));
      completeActivity(
        activityId,
        "failed",
        "Repository source scan failed. Review the source notice for details.",
      );
    } finally {
      setScanningSources((current) => {
        const next = new Set(current);
        next.delete(sourceId);
        return next;
      });
    }
  }

  async function registerRepositorySource(draft: RepositorySourceDraft) {
    try {
      const snapshot = await bridge.registerRepositorySource(draft);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setShowAddSource(false);
      setRepositoryActionError(null);
    } catch (error) {
      throw error as AppError;
    }
  }

  async function openDiscoveredRepository(
    sourceId: string,
    relativePath: string,
  ) {
    const discovered = registry?.sourceCatalogs[sourceId]?.repositories.find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (discovered && repositoryReadiness(discovered) === "gitOnly") {
      setGitOnboardingError(null);
      setGitOnboardingTarget({
        kind: "discovered",
        sourceId,
        relativePath,
        displayName: discovered.displayName,
        location: discovered.location,
      });
      return;
    }
    try {
      const snapshot = await bridge.openDiscoveredRepository(
        sourceId,
        relativePath,
      );
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    }
  }

  async function initializeGitRepository() {
    const target = gitOnboardingTarget;
    if (!target || gitOnboardingRunning) return;
    const activityId = startActivity({
      repositoryId:
        target.kind === "registered" ? target.repositoryId : target.sourceId,
      repositoryName: target.displayName,
      title: "Initialize Git repository",
      detail: "Initialize the selected Git repository as a colocated jj repository",
      commands: jjGitInitializationCommands(),
      category: "user",
    });
    setGitOnboardingRunning(true);
    setGitOnboardingError(null);
    try {
      const snapshot =
        target.kind === "registered"
          ? await bridge.initializeRepository(target.repositoryId)
          : await bridge.initializeDiscoveredRepository(
              target.sourceId,
              target.relativePath,
            );
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setGitOnboardingTarget(null);
      setRepositoryActionError(null);
      completeActivity(
        activityId,
        "success",
        "Git repository initialized as a colocated jj repository.",
      );
    } catch (error) {
      setGitOnboardingError((error as AppError).message);
      completeActivity(
        activityId,
        "failed",
        "Git repository initialization failed.",
      );
    } finally {
      setGitOnboardingRunning(false);
    }
  }

  async function removeRepositorySource(source: RepositorySourceRecord) {
    try {
      const snapshot = await bridge.removeRepositorySource(source.id);
      setRegistry(snapshot.registry);
      setRecoveryNotice(snapshot.recoveryNotice);
      setSourceErrors((current) => {
        const next = { ...current };
        delete next[source.id];
        return next;
      });
      setRemoveSourceTarget(null);
      setRepositoryActionError(null);
    } catch (error) {
      setRemoveSourceTarget(null);
      setRepositoryActionError((error as AppError).message);
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
      showHandoffNotice(`${preview.actionLabel}: ${preview.repositoryDisplayName}`);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    }
  }

  async function launchFileHandoff(path: string, target: "editor" | "reveal") {
    if (!selectedRepository) return;
    try {
      const preview = await bridge.launchFileHandoff(
        selectedRepository.id,
        path,
        target,
      );
      showHandoffNotice(`${preview.actionLabel}: ${preview.filePath}`);
      setRepositoryActionError(null);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
    }
  }

  async function copyFilePath(path: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }
      await navigator.clipboard.writeText(path);
      showHandoffNotice(`Copied path: ${path}`);
      setRepositoryActionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRepositoryActionError(message);
    }
  }

  function mutationExecuted(
    execution: MutationExecution,
    activityId?: string,
  ) {
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
    setRebaseSelectionNotice(null);
    setRepositoryActionError(null);
    if (activityId) {
      completeActivity(activityId, "success", execution.message);
    }
  }

  async function executeHistoryStep(
    kind: "undo" | "redo",
    operationId: string,
  ) {
    if (!selectedRepository || historyStepExecutingRef.current) return;
    historyStepExecutingRef.current = true;
    setHistoryStepExecuting(kind);
    setRepositoryActionError(null);
    const activityId = startActivity({
      repositoryId: selectedRepository.id,
      repositoryName: selectedRepository.displayName,
      title: kind === "undo" ? "Undo operation" : "Redo operation",
      detail: MUTATION_ACTIVITY_DETAILS[kind],
      commands: jjMutationCommands({ kind, operationId }),
      category: "user",
    });
    try {
      const preview = await bridge.previewMutation(selectedRepository.id, {
        kind,
        operationId,
      });
      const execution = await bridge.executeMutation({
        token: preview.token,
        confirmed: true,
      });
      mutationExecuted(execution, activityId);
    } catch (error) {
      setRepositoryActionError((error as AppError).message);
      completeActivity(
        activityId,
        "failed",
        `${kind === "undo" ? "Undo" : "Redo"} failed. See the repository notice for details.`,
      );
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
        <main className="loading-state activity-copy">
          <CliSpinner />
          <span>Loading repositories…</span>
        </main>
      </>
    );
  }

  const openRepositories = registry.openRepositoryIds
    .map((id) => registry.repositories.find((repository) => repository.id === id))
    .filter((repository): repository is RepositoryRecord => Boolean(repository));
  const standalone = standaloneRepositories(
    registry.repositories,
    registry.repositorySources,
  ).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
  const selectedState = selectedRepository
    ? repositoryState(
        selectedRepository.id,
        selectedRepository.location.kind,
        selectedCache,
        freshIds,
        refreshing,
        errors,
      )
    : "empty";
  const appUpdateRestartBlocked =
    activities.some((entry) => entry.state === "running") ||
    historyStepExecuting !== null ||
    gitOnboardingRunning;
  const updateAction = appUpdateActionModel(
    appUpdate,
    appUpdateRestartBlocked,
  );
  const tabPresentations = repositoryTabPresentations(openRepositories);
  const repositoryCommandBand = selectedRepository ? (
    <div className="repository-command-row">
      <div className="repository-activity-slot">
        <ActivityCenter
          entries={activities}
          selectedRepositoryId={selectedRepository.id}
          open={activityCenterOpen}
          onOpenChange={setActivityCenterOpen}
          onCancel={(entry) => void cancelActivity(entry)}
          onClearCompleted={() =>
            setActivities((current) =>
              current.filter((entry) => entry.state === "running"),
            )
          }
          fallback={
            <div className="repository-center-context">
              <strong>{selectedRepository.displayName}</strong>
              <small>
                <BookmarkLabels
                  bookmarks={selectedChange?.bookmarks ?? []}
                  limit={1}
                  emptyLabel="@"
                />
                <span aria-hidden="true">·</span>
                {locationLabel(selectedRepository.location.kind)}
              </small>
            </div>
          }
        />
      </div>
      <div className="toolbar-primary-controls">
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
            {historyStepExecuting === "undo" ? (
              <CliSpinner />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
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
            {historyStepExecuting === "redo" ? (
              <CliSpinner />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
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
      </div>
      <div className="toolbar-secondary-controls">
        {selectedProjection ? (
          <div className="repository-sync-slot">
            <SyncSummary
              sync={selectedProjection.syncStatus}
              conflicts={selectedProjection.conflicts}
            />
          </div>
        ) : null}
        <div className="toolbar-handoff-controls">
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
        </div>
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
          {selectedState === "refreshing" ? (
            <X aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {selectedState === "refreshing" ? "Cancel" : "Refresh"}
        </button>
      </div>
    </div>
  ) : (
    <div className="repository-command-row repository-command-empty">
      <span>Open a repository to start</span>
    </div>
  );

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
        {repositoryCommandBand}
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
              repository.location.kind,
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
            const tabPresentation = tabPresentations.get(repository.id);
            const TransportIcon =
              repository.location.kind === "local" ? Laptop : Server;
            return (
              <div
                className={[
                  "tab",
                  active ? "active" : "",
                  tabPresentation?.duplicateName ? "duplicate-name" : "",
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
                  aria-label={`${tabPresentation?.accessibleName ?? repository.displayName} repository tab, position ${tabIndex + 1} of ${openRepositories.length}`}
                  title={`${tabPresentation?.tooltip ?? repository.displayName}\nDrag to reorder · Alt+Shift+Left/Right`}
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
                  <TransportIcon className="tab-transport-icon" aria-hidden="true" />
                  <span className="tab-identity">
                    <span className="tab-name">{repository.displayName}</span>
                    {tabPresentation?.duplicateName ? (
                      <small className="tab-context">{tabPresentation.context}</small>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`Close ${tabPresentation?.accessibleName ?? repository.displayName} tab`}
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
          <div className="rail-actions" ref={railAddMenuRef}>
            <button type="button" aria-label="Switch repository" title="Switch repository (⌘K)" onClick={() => setShowSwitcher(true)}>
              <Search aria-hidden="true" />
            </button>
            <button
              ref={railAddButtonRef}
              type="button"
              aria-label="Add repository or repository source"
              aria-haspopup="menu"
              aria-expanded={showAddMenu}
              onClick={() => {
                if (!showAddMenu) {
                  const anchor =
                    railAddButtonRef.current?.getBoundingClientRect();
                  if (anchor) {
                    setRailAddMenuPosition(
                      anchoredPopupPosition({
                        anchor: {
                          left: anchor.left,
                          top: anchor.top,
                          bottom: anchor.bottom,
                        },
                        popupWidth: 242,
                        popupHeight: 108,
                        viewportWidth: window.innerWidth,
                        viewportHeight: window.innerHeight,
                      }),
                    );
                  }
                }
                setShowAddMenu((visible) => !visible);
              }}
            >
              <Plus aria-hidden="true" />
            </button>
            {showAddMenu &&
              railAddMenuPosition &&
              createPortal(
                <div
                  ref={railAddPopupRef}
                  className="rail-add-menu"
                  role="menu"
                  style={railAddMenuPosition}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowAdd(true);
                    }}
                  >
                    <FolderGit2 aria-hidden="true" />
                    <span>
                      <strong>Open repository…</strong>
                      <small>Add one local or SSH repository</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowAddSource(true);
                    }}
                  >
                    <FolderOpen aria-hidden="true" />
                    <span>
                      <strong>Add repository source…</strong>
                      <small>Scan a folder into a repository tree</small>
                    </span>
                  </button>
                </div>,
                document.body,
              )}
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
                setInspectorView("changes");
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
                setInspectorView("changes");
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
                setInspectorView("changes");
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
                setInspectorView("changes");
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
        <div className="repository-list-scroll">
          <RepositorySourceTree
            registry={registry}
            scanning={scanningSources}
            errors={sourceErrors}
            onOpen={openDiscoveredRepository}
            onRescan={scanRepositorySource}
            onRemove={setRemoveSourceTarget}
          />
          {standalone.length > 0 && (
            <section className="repository-group">
              <h3>Standalone</h3>
              {standalone.map((repository) => {
                const state = repositoryState(
                  repository.id,
                  repository.location.kind,
                  registry.cachedProjections[repository.id],
                  freshIds,
                  refreshing,
                  errors,
                );
                const gitOnly = repositoryReadiness(repository) === "gitOnly";
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
                    {gitOnly ? (
                      <span className="repository-state git-only">Git · Set up JJ</span>
                    ) : state !== "ready" && state !== "cached" ? (
                      <span className={`repository-state ${state}`}>{compactStateLabel(state)}</span>
                    ) : null}
                    <StatusDot state={state} />
                  </button>
                );
                })}
            </section>
          )}
        </div>
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
        {rebaseSelectionNotice && (
          <div className="notice rebase-selection-notice" role="status">
            <GitPullRequestArrow aria-hidden="true" /> {rebaseSelectionNotice}
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
            {errors[selectedRepository.id] && (
              <RepositoryRefreshNotice
                error={errors[selectedRepository.id]}
                hasCache={Boolean(selectedCache)}
                retryAt={retryAt[selectedRepository.id]}
              />
            )}
            {showWorkspaceManager ? (
              <WorkspaceManager
                workspaces={selectedProjection?.workspaces ?? []}
                onReviewChange={(workspace) => {
                  setShowWorkspaceManager(false);
                  setHistoryView("all");
                  setInspectorView("changes");
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
              repositoryId={selectedRepository.id}
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
              onOpenDiffQuickLook={(
                change,
                path,
                viewMode,
                quickLookWhitespaceMode,
              ) => {
                void toggleDiffQuickLookWindow({
                  repositoryId: selectedRepository.id,
                  repositoryName: selectedRepository.displayName,
                  changeId: change.changeId,
                  commitId: change.commitId,
                  selectedFilePath: path,
                  viewMode,
                  whitespaceMode: quickLookWhitespaceMode,
                }).catch((error: unknown) => {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  setRepositoryActionError(message);
                });
              }}
              canRevealFiles={selectedRepository.location.kind === "local"}
              onOpenFileInEditor={(path) =>
                void launchFileHandoff(path, "editor")
              }
              onRevealFile={(path) => void launchFileHandoff(path, "reveal")}
              onCopyFilePath={(path) => void copyFilePath(path)}
              onOpenFileTimeline={(change, path) => {
                void openFileTimelineWindow({
                  repositoryId: selectedRepository.id,
                  repositoryName: selectedRepository.displayName,
                  changeId: change.changeId,
                  commitId: change.commitId,
                  path,
                }).catch((error: unknown) => {
                  setRepositoryActionError(
                    error instanceof Error ? error.message : String(error),
                  );
                });
              }}
              inspectorView={inspectorView}
              onInspectorViewChange={setInspectorView}
              operationLog={operationLog}
              operationLoading={operationLoading}
              operationError={operationError}
              historyStepExecuting={historyStepExecuting}
              rebaseSourceCommitId={rebaseSourceCommitId}
              onRequestUndo={(operationId) =>
                void executeHistoryStep("undo", operationId)
              }
              onRequestRedo={(operationId) =>
                void executeHistoryStep("redo", operationId)
              }
              onLaunchMutation={({ intent, previewImmediately }) => {
                setMutationDialog({
                  initialIntent: intent,
                  previewImmediately,
                });
                if (intent.kind === "rebase") {
                  setRebaseSourceCommitId(null);
                  setRebaseSelectionNotice(null);
                }
              }}
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
            <span className="status-jj-version">
              jj {selectedProjection?.capability.detectedVersion ?? "not detected"}
            </span>
            {selectedCache && (
              <span className="status-cache-age">
                {relativeTime(selectedCache.cachedAt)}
              </span>
            )}
            {registry.repositories
              .filter((repository) => repository.id !== selectedRepository.id)
              .slice(0, 1)
              .map((repository) => {
                const state = repositoryState(
                  repository.id,
                  repository.location.kind,
                  registry.cachedProjections[repository.id],
                  freshIds,
                  refreshing,
                  errors,
                );
                return (
                  <button
                    type="button"
                    className="status-repository-switch status-secondary-repository"
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
          <>
            <span>No repository selected</span>
            <span className="status-spacer" />
          </>
        )}
        {updateAction && (
          <>
            <span className="status-update-divider" aria-hidden="true" />
            <button
              type="button"
              className={`status-update status-update-${appUpdate.phase}`}
              title={updateAction.title}
              disabled={updateAction.disabled}
              aria-live="polite"
              onClick={() => {
                if (updateAction.action === "check") {
                  void checkForAppUpdate(true);
                } else if (updateAction.action === "download") {
                  void downloadAppUpdate();
                } else if (updateAction.action === "restart") {
                  void restartAfterAppUpdate();
                }
              }}
            >
              {appUpdate.phase === "available" ? (
                <ArrowDownToLine aria-hidden="true" />
              ) : appUpdate.phase === "ready" ? (
                <RotateCw aria-hidden="true" />
              ) : appUpdate.phase === "error" ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <RefreshCw className="spinning" aria-hidden="true" />
              )}
              <span>{updateAction.label}</span>
              {appUpdate.phase === "downloading" &&
                updateAction.progress !== null && (
                  <span className="status-update-progress" aria-hidden="true">
                    <span style={{ width: `${updateAction.progress}%` }} />
                  </span>
                )}
            </button>
          </>
        )}
      </footer>

      {showAdd && (
        <AddRepositoryDialog onClose={() => setShowAdd(false)} onSubmit={registerRepository} />
      )}
      {showAddSource && (
        <AddRepositorySourceDialog
          onClose={() => setShowAddSource(false)}
          onSubmit={registerRepositorySource}
        />
      )}
      {gitOnboardingTarget && (
        <GitRepositoryOnboardingDialog
          target={gitOnboardingTarget}
          running={gitOnboardingRunning}
          error={gitOnboardingError}
          onClose={() => {
            if (gitOnboardingRunning) return;
            setGitOnboardingTarget(null);
            setGitOnboardingError(null);
          }}
          onConfirm={() => void initializeGitRepository()}
        />
      )}
      {showSwitcher && (
        <RepositoryQuickSwitcher
          repositories={registry.repositories}
          repositorySources={registry.repositorySources}
          sourceCatalogs={registry.sourceCatalogs}
          openRepositoryIds={registry.openRepositoryIds}
          onSelect={selectRepository}
          onOpenDiscovered={openDiscoveredRepository}
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
      {removeSourceTarget && (
        <RemoveRepositorySourceDialog
          source={removeSourceTarget}
          onClose={() => setRemoveSourceTarget(null)}
          onConfirm={() => void removeRepositorySource(removeSourceTarget)}
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
          onExecutionStarted={(title, kind, commands) =>
            startActivity({
              repositoryId: selectedRepository.id,
              repositoryName: selectedRepository.displayName,
              title,
              detail: MUTATION_ACTIVITY_DETAILS[kind],
              commands,
              category: "user",
            })
          }
          onExecutionFailed={(activityId) =>
            completeActivity(
              activityId,
              "failed",
              "Repository operation failed. Review the dialog for details.",
            )
          }
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

function StatusDot({ state }: { state: RepositoryState }) {
  const label = stateLabel(state);
  if (isDisconnectedState(state)) {
    return (
      <span
        className={`status-disconnected ${state}`}
        aria-label={label}
        title={label}
      >
        <Unplug aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={`status-dot ${state}`}
      aria-label={label}
      title={label}
    />
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
            title: "Choose a local Git or Jujutsu repository",
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
          <button type="submit" disabled={saving}>
            {saving ? (
              <span className="button-activity">
                <CliSpinner />
                Adding…
              </span>
            ) : (
              "Add repository"
            )}
          </button>
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
          {loading && (
            <p className="activity-copy">
              <CliSpinner />
              <span>Connecting and reading folders…</span>
            </p>
          )}
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

function GitRepositoryOnboardingDialog({
  target,
  running,
  error,
  onClose,
  onConfirm,
}: {
  target: GitOnboardingTarget;
  running: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || running) return;
      const key = event.key.toLowerCase();
      if (event.key === "Enter" || key === "y") {
        event.preventDefault();
        onConfirm();
      } else if (event.key === "Escape" || key === "n") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onConfirm, running]);

  const location =
    target.location.kind === "local"
      ? target.location.path
      : `${target.location.host}:${target.location.path}`;

  return (
    <div
      className="dialog-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="confirm-dialog git-onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-onboarding-title"
        aria-describedby="git-onboarding-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <FolderGit2 aria-hidden="true" />
          <h2 id="git-onboarding-title">
            Set up Jujutsu for {target.displayName}?
          </h2>
        </header>
        <p id="git-onboarding-description">
          jjcat found an existing Git repository. This adds colocated Jujutsu
          metadata while keeping its Git history and working tree in place.
        </p>
        <dl>
          <div>
            <dt>Repository</dt>
            <dd title={location}>{location}</dd>
          </div>
          <div>
            <dt>Command</dt>
            <dd>
              <code>jj git init --colocate .</code>
            </dd>
          </div>
        </dl>
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button
            type="button"
            className="secondary"
            aria-keyshortcuts="Escape N"
            onClick={onClose}
            disabled={running}
          >
            Cancel <kbd>Esc</kbd>
          </button>
          <button
            type="button"
            className="primary"
            aria-keyshortcuts="Enter Y"
            onClick={onConfirm}
            disabled={running}
          >
            {running ? (
              <span className="button-activity">
                <CliSpinner />
                Setting up…
              </span>
            ) : (
              <>Set up JJ and open <kbd>↵</kbd></>
            )}
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
        {refreshing ? <CliSpinner /> : <RefreshCw aria-hidden="true" />}
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

function RemoveRepositorySourceDialog({
  source,
  onClose,
  onConfirm,
}: {
  source: RepositorySourceRecord;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="dialog-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-source-title"
        aria-describedby="remove-source-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <Trash2 aria-hidden="true" />
          <h2 id="remove-source-title">Remove {source.displayName}?</h2>
        </header>
        <p id="remove-source-description">
          This removes only the source and its discovered tree from jjcat.
          Repositories already opened in tabs stay registered, and no local or
          remote files are deleted.
        </p>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Remove source
          </button>
        </footer>
      </section>
    </div>
  );
}

export default App;
