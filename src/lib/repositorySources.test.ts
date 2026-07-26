import { describe, expect, it } from "vitest";
import {
  buildRepositorySourceTree,
  registeredRepositoryFor,
  standaloneRepositories,
} from "./repositorySources";
import type {
  DiscoveredRepository,
  RepositoryRecord,
  RepositorySourceRecord,
} from "../types";

const discovered: DiscoveredRepository[] = [
  {
    relativePath: "zeta",
    displayName: "zeta",
    location: { kind: "local", path: "/code/zeta" },
  },
  {
    relativePath: "group/beta",
    displayName: "beta",
    location: { kind: "local", path: "/code/group/beta" },
  },
  {
    relativePath: "group/alpha",
    displayName: "alpha",
    location: { kind: "local", path: "/code/group/alpha" },
  },
];

describe("repository source tree", () => {
  it("groups folders first and sorts repositories stably", () => {
    expect(buildRepositorySourceTree(discovered)).toMatchObject([
      {
        kind: "folder",
        name: "group",
        children: [
          { kind: "repository", name: "alpha" },
          { kind: "repository", name: "beta" },
        ],
      },
      { kind: "repository", name: "zeta" },
    ]);
  });

  it("matches registered repositories by exact transport and location", () => {
    const registered: RepositoryRecord[] = [
      {
        id: "registered",
        displayName: "beta",
        location: { kind: "local", path: "/code/group/beta" },
        pinned: false,
        lastOpenedAt: null,
      },
    ];
    expect(registeredRepositoryFor(registered, discovered[1])?.id).toBe("registered");
    expect(registeredRepositoryFor(registered, discovered[0])).toBeUndefined();
  });

  it("keeps only repositories outside every configured source as standalone", () => {
    const sources: RepositorySourceRecord[] = [
      {
        id: "local-source",
        displayName: "Local",
        location: { kind: "local", path: "/code" },
        scanDepth: 3,
      },
    ];
    const repositories: RepositoryRecord[] = [
      {
        id: "inside",
        displayName: "inside",
        location: { kind: "local", path: "/code/inside" },
        pinned: false,
        lastOpenedAt: null,
      },
      {
        id: "sibling-prefix",
        displayName: "sibling-prefix",
        location: { kind: "local", path: "/code-other/repo" },
        pinned: false,
        lastOpenedAt: null,
      },
      {
        id: "remote",
        displayName: "remote",
        location: { kind: "ssh", host: "dev", path: "/code/inside" },
        pinned: false,
        lastOpenedAt: null,
      },
    ];
    expect(standaloneRepositories(repositories, sources).map((repository) => repository.id)).toEqual([
      "sibling-prefix",
      "remote",
    ]);
  });
});
