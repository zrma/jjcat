import type { RepositoryProjection } from "../types";

export function repositoryNavigation(projection?: RepositoryProjection) {
  return {
    workingCopyFiles: projection?.workingCopyFileCount ?? 0,
    conflicts: projection?.conflicts ?? 0,
  };
}
