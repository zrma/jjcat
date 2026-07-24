import { describe, expect, it } from "vitest";
import type { ChangeRow } from "../types";
import {
  mutationLaunchForChange,
  type ChangeActionKind,
} from "./changeActions";

function change(overrides: Partial<ChangeRow> = {}): ChangeRow {
  return {
    changeId: "change-a",
    commitId: "commit-a",
    summary: "feat: selected change",
    description: "feat: selected change\n\nTrailer: value",
    author: "Example",
    updatedAt: "2026-01-01T00:00:00Z",
    bookmarks: [{ name: "main", remote: null }],
    parents: ["change-parent"],
    parentCommitIds: ["commit-parent"],
    files: [{ status: "M", path: "src/main.ts" }],
    conflict: false,
    workingCopy: false,
    empty: false,
    ...overrides,
  };
}

describe("mutationLaunchForChange", () => {
  it("opens direct edit and abandon actions in preview", () => {
    const selected = change();

    expect(mutationLaunchForChange("edit", selected, [selected])).toEqual({
      intent: { kind: "edit", targetCommitId: "commit-a" },
      previewImmediately: true,
    });
    expect(mutationLaunchForChange("abandon", selected, [selected])).toEqual({
      intent: { kind: "abandon", targetCommitIds: ["commit-a"] },
      previewImmediately: true,
    });
  });

  it("keeps configurable shaping actions on their focused form", () => {
    const selected = change();

    expect(mutationLaunchForChange("rebase", selected, [selected])).toEqual({
      intent: {
        kind: "rebase",
        sourceCommitId: "commit-a",
        destinationCommitId: "commit-parent",
      },
      previewImmediately: false,
    });
    expect(mutationLaunchForChange("split", selected, [selected])).toEqual({
      intent: {
        kind: "split",
        sourceCommitId: "commit-a",
        paths: ["src/main.ts"],
        message: "feat: selected change\n\nTrailer: value",
      },
      previewImmediately: false,
    });
  });

  it("uses the selected local bookmark for bookmark actions", () => {
    const selected = change({
      bookmarks: [
        { name: "release", remote: null },
        { name: "release", remote: "origin" },
      ],
    });

    expect(
      mutationLaunchForChange("bookmarkMove", selected, [selected]),
    ).toEqual({
      intent: {
        kind: "bookmarkMove",
        name: "release",
        targetCommitId: "commit-a",
      },
      previewImmediately: false,
    });
    expect(mutationLaunchForChange("push", selected, [selected])).toEqual({
      intent: { kind: "push", name: "release", remote: "origin" },
      previewImmediately: false,
    });
  });

  it.each<ChangeActionKind>([
    "describe",
    "rebase",
    "squash",
    "split",
    "bookmarkMove",
    "push",
  ])("does not preview configurable %s immediately", (kind) => {
    const selected = change();
    expect(
      mutationLaunchForChange(kind, selected, [selected]).previewImmediately,
    ).toBe(false);
  });
});
