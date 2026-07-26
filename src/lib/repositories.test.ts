import { describe, expect, it } from "vitest";
import type { RepositoryRecord } from "../types";
import {
  filterRepositories,
  groupRepositories,
  repositoryLocationText,
  repositoryTabPresentations,
} from "./repositories";

const repositories: RepositoryRecord[] = [
  {
    id: "local",
    displayName: "Product App",
    location: { kind: "local", path: "/fixtures/product-app" },
    pinned: false,
    lastOpenedAt: null,
  },
  {
    id: "remote",
    displayName: "Infrastructure",
    location: { kind: "ssh", host: "fixture-host", path: "~/fixtures/infra" },
    pinned: true,
    lastOpenedAt: "2026-01-02T03:04:05Z",
  },
];

describe("repository search", () => {
  it("matches display names, local paths, and SSH locations without reordering", () => {
    expect(filterRepositories(repositories, "product").map((repository) => repository.id)).toEqual([
      "local",
    ]);
    expect(filterRepositories(repositories, "fixture-host").map((repository) => repository.id)).toEqual([
      "remote",
    ]);
    expect(filterRepositories(repositories, "fixtures").map((repository) => repository.id)).toEqual([
      "local",
      "remote",
    ]);
  });

  it("formats transport-specific location text", () => {
    expect(repositoryLocationText(repositories[0])).toBe("/fixtures/product-app");
    expect(repositoryLocationText(repositories[1])).toBe("fixture-host:~/fixtures/infra");
  });

  it("disambiguates duplicate tab names with transport context", () => {
    const duplicateLocal = {
      ...repositories[0],
      id: "local-shared",
      displayName: "Shared",
    };
    const duplicateRemote = {
      ...repositories[1],
      id: "remote-shared",
      displayName: "shared",
    };

    const presentations = repositoryTabPresentations([
      duplicateLocal,
      duplicateRemote,
      repositories[0],
    ]);

    expect(presentations.get("local-shared")).toEqual({
      context: "Local",
      duplicateName: true,
      tooltip: "Shared · Local\n/fixtures/product-app",
      accessibleName: "Shared, Local",
    });
    expect(presentations.get("remote-shared")).toEqual({
      context: "fixture-host",
      duplicateName: true,
      tooltip: "shared · SSH fixture-host\nfixture-host:~/fixtures/infra",
      accessibleName: "shared, SSH fixture-host",
    });
    expect(presentations.get(repositories[0].id)?.duplicateName).toBe(false);
  });

  it("keeps the rail stable by grouping only pinned and transport repositories", () => {
    const groups = groupRepositories(repositories);

    expect(groups.map((group) => group.label)).toEqual(["Pinned", "Local"]);
    expect(groups.flatMap((group) => group.repositories.map((repository) => repository.id))).toEqual([
      "remote",
      "local",
    ]);
  });

  it("does not reorder unpinned repositories when last-opened metadata changes", () => {
    const first = { ...repositories[0], lastOpenedAt: "2026-01-03T00:00:00Z" };
    const second = {
      ...repositories[0],
      id: "second-local",
      displayName: "Second Local",
      lastOpenedAt: "2026-01-04T00:00:00Z",
    };

    expect(
      groupRepositories([first, second])
        .flatMap((group) => group.repositories)
        .map((repository) => repository.id),
    ).toEqual(["local", "second-local"]);
  });
});
