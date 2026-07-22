import { describe, expect, it } from "vitest";
import type { RepositoryRecord } from "../types";
import { filterRepositories, groupRepositories, repositoryLocationText } from "./repositories";

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

  it("places each repository in exactly one pinned, recent, or transport group", () => {
    const groups = groupRepositories(repositories);

    expect(groups.map((group) => group.label)).toEqual(["Pinned", "Local"]);
    expect(groups.flatMap((group) => group.repositories.map((repository) => repository.id))).toEqual([
      "remote",
      "local",
    ]);
  });
});
