import type { RepositoryRecord } from "../types";

export function repositoryLocationText(repository: RepositoryRecord) {
  return repository.location.kind === "local"
    ? repository.location.path
    : `${repository.location.host}:${repository.location.path}`;
}

export interface RepositoryTabPresentation {
  context: string;
  duplicateName: boolean;
  tooltip: string;
  accessibleName: string;
}

export function repositoryTabPresentations(
  repositories: RepositoryRecord[],
): Map<string, RepositoryTabPresentation> {
  const nameCounts = new Map<string, number>();
  for (const repository of repositories) {
    const name = normalizedRepositoryName(repository.displayName);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return new Map(
    repositories.map((repository) => {
      const duplicateName =
        (nameCounts.get(normalizedRepositoryName(repository.displayName)) ?? 0) > 1;
      const context =
        repository.location.kind === "local" ? "Local" : repository.location.host;
      const transport =
        repository.location.kind === "local" ? "Local" : `SSH ${repository.location.host}`;
      return [
        repository.id,
        {
          context,
          duplicateName,
          tooltip: `${repository.displayName} · ${transport}\n${repositoryLocationText(repository)}`,
          accessibleName: `${repository.displayName}, ${transport}`,
        },
      ];
    }),
  );
}

function normalizedRepositoryName(displayName: string) {
  return displayName.trim().toLocaleLowerCase();
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
