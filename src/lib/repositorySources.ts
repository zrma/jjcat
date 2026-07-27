import type {
  DiscoveredRepository,
  RepositoryLocation,
  RepositoryReadiness,
  RepositoryRecord,
  RepositorySourceRecord,
} from "../types";

export type RepositorySourceTreeNode =
  | {
      kind: "folder";
      name: string;
      relativePath: string;
      children: RepositorySourceTreeNode[];
    }
  | {
      kind: "repository";
      name: string;
      relativePath: string;
      repository: DiscoveredRepository;
    };

interface MutableFolder {
  name: string;
  relativePath: string;
  folders: Map<string, MutableFolder>;
  repositories: DiscoveredRepository[];
}

export function buildRepositorySourceTree(
  repositories: DiscoveredRepository[],
): RepositorySourceTreeNode[] {
  const root: MutableFolder = {
    name: "",
    relativePath: "",
    folders: new Map(),
    repositories: [],
  };
  for (const repository of repositories) {
    const parts = repository.relativePath.split("/");
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const relativePath = [folder.relativePath, part].filter(Boolean).join("/");
      let child = folder.folders.get(part);
      if (!child) {
        child = {
          name: part,
          relativePath,
          folders: new Map(),
          repositories: [],
        };
        folder.folders.set(part, child);
      }
      folder = child;
    }
    folder.repositories.push(repository);
  }
  return materialize(root);
}

function materialize(folder: MutableFolder): RepositorySourceTreeNode[] {
  const folders = [...folder.folders.values()]
    .sort(compareNamed)
    .map(
      (child): RepositorySourceTreeNode => ({
        kind: "folder",
        name: child.name,
        relativePath: child.relativePath,
        children: materialize(child),
      }),
    );
  const repositories = [...folder.repositories]
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    )
    .map(
      (repository): RepositorySourceTreeNode => ({
        kind: "repository",
        name: repository.displayName,
        relativePath: repository.relativePath,
        repository,
      }),
    );
  return [...folders, ...repositories];
}

function compareNamed(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function repositoryLocationKey(location: RepositoryLocation) {
  return location.kind === "local"
    ? `local\0${trimTrailingSlash(location.path)}`
    : `ssh\0${location.host.toLocaleLowerCase()}\0${trimTrailingSlash(location.path)}`;
}

export function repositoryReadiness(repository: {
  readiness?: RepositoryReadiness;
}): RepositoryReadiness {
  return repository.readiness ?? "ready";
}

export function registeredRepositoryFor(
  repositories: RepositoryRecord[],
  discovered: DiscoveredRepository,
) {
  const key = repositoryLocationKey(discovered.location);
  return repositories.find(
    (repository) => repositoryLocationKey(repository.location) === key,
  );
}

export function standaloneRepositories(
  repositories: RepositoryRecord[],
  sources: RepositorySourceRecord[],
) {
  return repositories.filter(
    (repository) =>
      !sources.some((source) => sourceContainsLocation(source, repository.location)),
  );
}

function sourceContainsLocation(
  source: RepositorySourceRecord,
  location: RepositoryLocation,
) {
  if (source.location.kind !== location.kind) return false;
  if (source.location.kind === "local" && location.kind === "local") {
    return isPathDescendant(source.location.path, location.path);
  }
  if (source.location.kind === "ssh" && location.kind === "ssh") {
    return (
      source.location.host.toLocaleLowerCase() === location.host.toLocaleLowerCase() &&
      isPathDescendant(source.location.path, location.path)
    );
  }
  return false;
}

function isPathDescendant(root: string, candidate: string) {
  const normalizedRoot = trimTrailingSlash(root);
  const normalizedCandidate = trimTrailingSlash(candidate);
  return normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function trimTrailingSlash(path: string) {
  return path === "/" ? path : path.replace(/\/+$/, "");
}
