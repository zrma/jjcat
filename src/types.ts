export type RepositoryId = string;
export type RepositorySourceId = string;

export type RepositoryLocation =
  | { kind: "local"; path: string }
  | { kind: "ssh"; host: string; path: string };

export type RepositoryReadiness = "ready" | "gitOnly";

export interface RepositoryRecord {
  id: RepositoryId;
  displayName: string;
  location: RepositoryLocation;
  readiness?: RepositoryReadiness;
  pinned: boolean;
  lastOpenedAt: string | null;
}

export interface RepositorySourceRecord {
  id: RepositorySourceId;
  displayName: string;
  location: RepositoryLocation;
  scanDepth: number;
}

export interface DiscoveredRepository {
  relativePath: string;
  displayName: string;
  location: RepositoryLocation;
  readiness?: RepositoryReadiness;
}

export interface SourceCatalog {
  sourceId: RepositorySourceId;
  scannedAt: string;
  repositories: DiscoveredRepository[];
}

export interface ChangedFile {
  status: string;
  path: string;
  displayPath?: string;
}

export interface RevisionTreeEntry {
  path: string;
  fileType: "file" | "symlink" | "tree" | "git-submodule" | "conflict" | string;
  conflict: boolean;
  executable: boolean;
  status: string | null;
}

export interface RevisionTreeProjection {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  entries: RevisionTreeEntry[];
  truncated: boolean;
}

export interface RevisionFileProjection {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  entry: RevisionTreeEntry;
  content: string;
  binary: boolean;
  truncated: boolean;
}

export interface FileHistoryEntry {
  changeId: string;
  commitId: string;
  summary: string;
  author: string;
  timestamp: string;
}

export interface FileAnnotationLine {
  lineNumber: number;
  originalLineNumber: number;
  firstLineInHunk: boolean;
  changeId: string;
  commitId: string;
  summary: string;
  author: string;
  timestamp: string;
  content: string;
}

export interface FileTimelineProjection {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  path: string;
  history: FileHistoryEntry[];
  lines: FileAnnotationLine[];
  binary: boolean;
  truncated: boolean;
}

export interface RevisionFileRequest {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  path: string;
}

export type WhitespaceMode = "preserve" | "ignoreAll";
export type DiffViewMode = "unified" | "sideBySide";
export type InspectorView = "changes" | "fileTree" | "operations";
export type DiffLineKind = "context" | "addition" | "deletion" | "metadata";

export interface DiffLine {
  kind: DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiffRequest {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  path: string;
  whitespaceMode: WhitespaceMode;
}

export interface FileDiffProjection {
  repositoryId: RepositoryId;
  changeId: string;
  commitId: string;
  file: ChangedFile;
  whitespaceMode: WhitespaceMode;
  hunks: DiffHunk[];
  binary: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
}

export interface OperationRow {
  id: string;
  description: string;
  startedAt: string;
  snapshot: boolean;
  current: boolean;
  undoEligible: boolean;
}

export interface OperationLogProjection {
  repositoryId: RepositoryId;
  operations: OperationRow[];
  undoTarget: string | null;
  redoTarget: string | null;
}

export interface BookmarkRef {
  name: string;
  remote: string | null;
}

export interface ChangeRow {
  changeId: string;
  commitId: string;
  summary: string;
  description?: string;
  author: string;
  authorEmail?: string;
  authorTimestamp?: string;
  committer?: string;
  committerEmail?: string;
  committerTimestamp?: string;
  updatedAt: string;
  bookmarks: BookmarkRef[];
  parents: string[];
  parentCommitIds?: string[];
  files: ChangedFile[];
  conflict: boolean;
  workingCopy: boolean;
  workspaceCopies?: string[];
  empty: boolean;
}

export interface WorkspaceRow {
  name: string;
  root: string;
  changeId: string;
  commitId: string;
  summary: string;
  updatedAt: string;
  current: boolean;
  empty: boolean;
  conflict: boolean;
  fileCount: number;
}

export interface RepositoryProjection {
  repositoryId: RepositoryId;
  refreshedAt: string;
  capability: {
    detectedVersion: string;
    minimumVersion: string;
    supported: boolean;
  };
  changes: ChangeRow[];
  conflicts: number;
  workingCopyHasChanges: boolean;
  workingCopyFileCount: number;
  workspaces: WorkspaceRow[];
  syncStatus: SyncStatus;
}

export interface SyncStatus {
  available: boolean;
  remoteHeads: number;
  outgoing: number;
  behind: number;
  basis: "lastFetched";
}

export interface CachedProjection {
  cachedAt: string;
  projection: RepositoryProjection;
}

export interface Registry {
  schemaVersion: number;
  selectedRepository: RepositoryId | null;
  openRepositoryIds: RepositoryId[];
  repositories: RepositoryRecord[];
  cachedProjections: Record<RepositoryId, CachedProjection>;
  repositorySources: RepositorySourceRecord[];
  sourceCatalogs: Record<RepositorySourceId, SourceCatalog>;
}

export interface RegistrySnapshot {
  registry: Registry;
  recoveryNotice: string | null;
}

export interface RepositoryDraft {
  displayName: string;
  location: RepositoryLocation;
}

export interface RepositorySourceDraft {
  displayName: string;
  location: RepositoryLocation;
  scanDepth: number;
}

export interface RemoteDirectoryListing {
  path: string;
  parent: string | null;
  directories: string[];
}

export interface AppError {
  kind: string;
  message: string;
}

export type HandoffTarget = "editor" | "terminal";

export interface HandoffPreview {
  repositoryDisplayName: string;
  target: HandoffTarget;
  actionLabel: string;
}

export type FileHandoffTarget = "editor" | "reveal";

export interface FileHandoffPreview {
  repositoryDisplayName: string;
  filePath: string;
  target: FileHandoffTarget;
  actionLabel: string;
}

export type MutationIntent =
  | { kind: "new"; parentCommitIds: string[] }
  | { kind: "edit"; targetCommitId: string }
  | { kind: "describe"; targetCommitId: string; message: string }
  | { kind: "fetch"; remote: string | null }
  | { kind: "rebase"; sourceCommitId: string; destinationCommitId: string }
  | { kind: "squash"; sourceCommitId: string; destinationCommitId: string }
  | { kind: "split"; sourceCommitId: string; paths: string[]; message: string }
  | { kind: "abandon"; targetCommitIds: string[] }
  | { kind: "pruneEmpty" }
  | { kind: "removeWorkspace"; name: string }
  | { kind: "undo"; operationId: string }
  | { kind: "redo"; operationId: string }
  | { kind: "bookmarkMove"; name: string; targetCommitId: string }
  | { kind: "push"; name: string; remote: string };

export type MutationKind = MutationIntent["kind"];
export type MutationRisk =
  | "workingCopy"
  | "network"
  | "rewrite"
  | "destructive"
  | "recovery"
  | "remoteWrite";

export interface MutationCandidate {
  changeId: string;
  commitId: string;
  summary: string;
}

export interface MutationTarget {
  label: string;
  value: string;
  commitId: string | null;
}

export interface MutationPreview {
  token: string;
  repositoryId: RepositoryId;
  repositoryDisplayName: string;
  kind: MutationKind;
  title: string;
  effect: string;
  risk: MutationRisk;
  expectedOperationId: string;
  targets: MutationTarget[];
  candidates: MutationCandidate[];
}

export interface MutationExecution {
  previewToken: string;
  repositoryId: RepositoryId;
  kind: MutationKind;
  previousOperationId: string;
  operationId: string;
  message: string;
  recoveryRequired: boolean;
  projection: RepositoryProjection;
  operationLog: OperationLogProjection;
}

export interface ExecuteMutationRequest {
  token: string;
  confirmed: boolean;
}
