import { describe, expect, it } from "vitest";
import type { RepositoryProjection } from "../types";
import { repositoryNavigation } from "./repositoryNavigation";

describe("repository navigation", () => {
  it("reports working copy files without exposing the bounded history window", () => {
    const projection = {
      changes: Array.from({ length: 200 }, () => ({
        bookmarks: [],
      })),
      conflicts: 0,
      workingCopyFileCount: 18,
    } as unknown as RepositoryProjection;

    expect(repositoryNavigation(projection)).toEqual({
      workingCopyFiles: 18,
      conflicts: 0,
    });
  });
});
