import type { RepositoryRecord } from "../types";

export function repositoryLocationText(repository: RepositoryRecord) {
  return repository.location.kind === "local"
    ? repository.location.path
    : `${repository.location.host}:${repository.location.path}`;
}

export function filterRepositories(repositories: RepositoryRecord[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return repositories;
  return repositories.filter((repository) =>
    `${repository.displayName}\n${repositoryLocationText(repository)}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
}
