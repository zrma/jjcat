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
}

export interface BookmarkRef {
  name: string;
  remote: string | null;
}

export interface ChangeRow {
  changeId: string;
  commitId: string;
  summary: string;
  author: string;
  updatedAt: string;
  bookmarks: BookmarkRef[];
  parents: string[];
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
