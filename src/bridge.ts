import { invoke } from "@tauri-apps/api/core";
import { DemoBridge } from "./demo";
import type {
  AppError,
  CachedProjection,
  ChangeRow,
  RegistrySnapshot,
  RemoteDirectoryListing,
  RepositoryDraft,
  RepositorySourceDraft,
  HandoffPreview,
  HandoffTarget,
  FileDiffProjection,
  FileDiffRequest,
  OperationLogProjection,
  ExecuteMutationRequest,
  MutationExecution,
  MutationIntent,
  MutationPreview,
} from "./types";

interface Bridge {
  loadRegistry(): Promise<RegistrySnapshot>;
  registerRepository(draft: RepositoryDraft): Promise<RegistrySnapshot>;
  registerRepositorySource(draft: RepositorySourceDraft): Promise<RegistrySnapshot>;
  scanRepositorySource(sourceId: string): Promise<RegistrySnapshot>;
  openDiscoveredRepository(sourceId: string, relativePath: string): Promise<RegistrySnapshot>;
  removeRepositorySource(sourceId: string): Promise<RegistrySnapshot>;
  removeRepository(repositoryId: string): Promise<RegistrySnapshot>;
  listSshHosts(): Promise<string[]>;
  listRemoteDirectories(host: string, path: string): Promise<RemoteDirectoryListing>;
  selectRepository(repositoryId: string): Promise<RegistrySnapshot>;
  updateOpenRepositories(
    openRepositoryIds: string[],
    selectedRepository: string | null,
  ): Promise<RegistrySnapshot>;
  setRepositoryPinned(repositoryId: string, pinned: boolean): Promise<RegistrySnapshot>;
  refreshRepository(repositoryId: string, requestId: string): Promise<CachedProjection>;
  cancelRefresh(requestId: string): Promise<boolean>;
  loadChangeDetails(
    repositoryId: string,
    changeId: string,
    commitId: string,
  ): Promise<ChangeRow>;
  loadFileDiff(request: FileDiffRequest): Promise<FileDiffProjection>;
  loadOperationLog(repositoryId: string): Promise<OperationLogProjection>;
  previewMutation(repositoryId: string, intent: MutationIntent): Promise<MutationPreview>;
  executeMutation(request: ExecuteMutationRequest): Promise<MutationExecution>;
  previewRepositoryHandoff(repositoryId: string, target: HandoffTarget): Promise<HandoffPreview>;
  launchRepositoryHandoff(repositoryId: string, target: HandoffTarget): Promise<HandoffPreview>;
}

export const isTauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class TauriBridge implements Bridge {
  loadRegistry() {
    return invoke<RegistrySnapshot>("load_registry").catch(normalizeError);
  }

  registerRepository(draft: RepositoryDraft) {
    return invoke<RegistrySnapshot>("register_repository", { draft }).catch(normalizeError);
  }

  registerRepositorySource(draft: RepositorySourceDraft) {
    return invoke<RegistrySnapshot>("register_repository_source", { draft }).catch(normalizeError);
  }

  scanRepositorySource(sourceId: string) {
    return invoke<RegistrySnapshot>("scan_repository_source", { sourceId }).catch(normalizeError);
  }

  openDiscoveredRepository(sourceId: string, relativePath: string) {
    return invoke<RegistrySnapshot>("open_discovered_repository", {
      sourceId,
      relativePath,
    }).catch(normalizeError);
  }

  removeRepositorySource(sourceId: string) {
    return invoke<RegistrySnapshot>("remove_repository_source", { sourceId }).catch(normalizeError);
  }

  removeRepository(repositoryId: string) {
    return invoke<RegistrySnapshot>("remove_repository", { repositoryId }).catch(normalizeError);
  }

  listSshHosts() {
    return invoke<string[]>("list_ssh_hosts").catch(normalizeError);
  }

  listRemoteDirectories(host: string, path: string) {
    return invoke<RemoteDirectoryListing>("list_remote_directories", { host, path }).catch(
      normalizeError,
    );
  }

  selectRepository(repositoryId: string) {
    return invoke<RegistrySnapshot>("select_repository", { repositoryId }).catch(normalizeError);
  }

  updateOpenRepositories(openRepositoryIds: string[], selectedRepository: string | null) {
    return invoke<RegistrySnapshot>("update_open_repositories", {
      openRepositoryIds,
      selectedRepository,
    }).catch(normalizeError);
  }

  setRepositoryPinned(repositoryId: string, pinned: boolean) {
    return invoke<RegistrySnapshot>("set_repository_pinned", { repositoryId, pinned }).catch(
      normalizeError,
    );
  }

  refreshRepository(repositoryId: string, requestId: string) {
    return invoke<CachedProjection>("refresh_repository", { repositoryId, requestId }).catch(normalizeError);
  }

  cancelRefresh(requestId: string) {
    return invoke<boolean>("cancel_refresh", { requestId }).catch(normalizeError);
  }

  loadChangeDetails(repositoryId: string, changeId: string, commitId: string) {
    return invoke<ChangeRow>("load_change_details", {
      repositoryId,
      changeId,
      commitId,
    }).catch(normalizeError);
  }

  loadFileDiff(request: FileDiffRequest) {
    return invoke<FileDiffProjection>("load_file_diff", { request }).catch(normalizeError);
  }

  loadOperationLog(repositoryId: string) {
    return invoke<OperationLogProjection>("load_operation_log", { repositoryId }).catch(
      normalizeError,
    );
  }

  previewMutation(repositoryId: string, intent: MutationIntent) {
    return invoke<MutationPreview>("preview_mutation", { repositoryId, intent }).catch(
      normalizeError,
    );
  }

  executeMutation(request: ExecuteMutationRequest) {
    return invoke<MutationExecution>("execute_mutation", { request }).catch(normalizeError);
  }

  previewRepositoryHandoff(repositoryId: string, target: HandoffTarget) {
    return invoke<HandoffPreview>("preview_repository_handoff", { repositoryId, target }).catch(
      normalizeError,
    );
  }

  launchRepositoryHandoff(repositoryId: string, target: HandoffTarget) {
    return invoke<HandoffPreview>("launch_repository_handoff", { repositoryId, target }).catch(
      normalizeError,
    );
  }
}

function normalizeError(error: unknown): never {
  if (typeof error === "object" && error !== null && "message" in error) {
    throw error as AppError;
  }
  throw { kind: "unknown", message: String(error) } satisfies AppError;
}

export const bridge: Bridge = isTauriRuntime ? new TauriBridge() : new DemoBridge();
