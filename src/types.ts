export type RepositoryId = string;

export type RepositoryLocation =
  | { kind: "local"; path: string }
  | { kind: "ssh"; host: string; path: string };

export interface RepositoryRecord {
  id: RepositoryId;
  displayName: string;
  location: RepositoryLocation;
  pinned: boolean;
  lastOpenedAt: string | null;
}

export interface ChangedFile {
  status: string;
  path: string;
  displayPath?: string;
}

export type WhitespaceMode = "preserve" | "ignoreAll";
export type DiffViewMode = "unified" | "sideBySide";
export type InspectorView = "overview" | "changes" | "operations";
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
  empty: boolean;
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
}

export interface RegistrySnapshot {
  registry: Registry;
  recoveryNotice: string | null;
}

export interface RepositoryDraft {
  displayName: string;
  location: RepositoryLocation;
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
  | { kind: "undo"; operationId: string }
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
  requiresTypedConfirmation: boolean;
  confirmationPhrase: string;
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
  confirmation: string | null;
}
