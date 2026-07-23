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

export interface RepositoryGroup {
  label: "Pinned" | "Local" | "SSH";
  repositories: RepositoryRecord[];
}

export function groupRepositories(repositories: RepositoryRecord[]): RepositoryGroup[] {
  const pinned = repositories.filter((repository) => repository.pinned);
  const grouped = new Set(pinned.map((repository) => repository.id));
  const remaining = repositories.filter((repository) => !grouped.has(repository.id));
  const groups: RepositoryGroup[] = [
    { label: "Pinned", repositories: pinned },
    {
      label: "Local",
      repositories: remaining.filter((repository) => repository.location.kind === "local"),
    },
    {
      label: "SSH",
      repositories: remaining.filter((repository) => repository.location.kind === "ssh"),
    },
  ];
  return groups.filter((group) => group.repositories.length > 0);
}
