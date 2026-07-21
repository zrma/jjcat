import { invoke } from "@tauri-apps/api/core";
import { DemoBridge } from "./demo";
import type { AppError, CachedProjection, RegistrySnapshot, RepositoryDraft } from "./types";

interface Bridge {
  loadRegistry(): Promise<RegistrySnapshot>;
  registerRepository(draft: RepositoryDraft): Promise<RegistrySnapshot>;
  selectRepository(repositoryId: string): Promise<void>;
  refreshRepository(repositoryId: string, requestId: string): Promise<CachedProjection>;
  cancelRefresh(requestId: string): Promise<boolean>;
}

export const isTauriRuntime = "__TAURI_INTERNALS__" in window;

class TauriBridge implements Bridge {
  loadRegistry() {
    return invoke<RegistrySnapshot>("load_registry").catch(normalizeError);
  }

  registerRepository(draft: RepositoryDraft) {
    return invoke<RegistrySnapshot>("register_repository", { draft }).catch(normalizeError);
  }

  selectRepository(repositoryId: string) {
    return invoke<void>("select_repository", { repositoryId }).catch(normalizeError);
  }

  refreshRepository(repositoryId: string, requestId: string) {
    return invoke<CachedProjection>("refresh_repository", { repositoryId, requestId }).catch(normalizeError);
  }

  cancelRefresh(requestId: string) {
    return invoke<boolean>("cancel_refresh", { requestId }).catch(normalizeError);
  }
}

function normalizeError(error: unknown): never {
  if (typeof error === "object" && error !== null && "message" in error) {
    throw error as AppError;
  }
  throw { kind: "unknown", message: String(error) } satisfies AppError;
}

export const bridge: Bridge = isTauriRuntime ? new TauriBridge() : new DemoBridge();
