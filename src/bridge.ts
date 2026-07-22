import { invoke } from "@tauri-apps/api/core";
import { DemoBridge } from "./demo";
import type {
  AppError,
  CachedProjection,
  RegistrySnapshot,
  RemoteDirectoryListing,
  RepositoryDraft,
  HandoffPreview,
  HandoffTarget,
  FileDiffProjection,
  FileDiffRequest,
} from "./types";

interface Bridge {
  loadRegistry(): Promise<RegistrySnapshot>;
  registerRepository(draft: RepositoryDraft): Promise<RegistrySnapshot>;
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
  loadFileDiff(request: FileDiffRequest): Promise<FileDiffProjection>;
  previewRepositoryHandoff(repositoryId: string, target: HandoffTarget): Promise<HandoffPreview>;
  launchRepositoryHandoff(repositoryId: string, target: HandoffTarget): Promise<HandoffPreview>;
}

export const isTauriRuntime = "__TAURI_INTERNALS__" in window;

class TauriBridge implements Bridge {
  loadRegistry() {
    return invoke<RegistrySnapshot>("load_registry").catch(normalizeError);
  }

  registerRepository(draft: RepositoryDraft) {
    return invoke<RegistrySnapshot>("register_repository", { draft }).catch(normalizeError);
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

  loadFileDiff(request: FileDiffRequest) {
    return invoke<FileDiffProjection>("load_file_diff", { request }).catch(normalizeError);
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
