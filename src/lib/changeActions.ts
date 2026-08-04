import type { ChangeRow, MutationIntent } from "../types";

export type ChangeActionKind =
  | "edit"
  | "describe"
  | "rebase"
  | "squash"
  | "split"
  | "abandon"
  | "bookmarkMove"
  | "push";

export interface MutationLaunch {
  intent: MutationIntent;
  previewImmediately: boolean;
}

export function canSplitChange(commitId: string) {
  return !/^0+$/.test(commitId);
}

export function mutationLaunchForFileSplit(
  change: ChangeRow,
  path: string,
): MutationLaunch {
  return {
    intent: {
      kind: "split",
      sourceCommitId: change.commitId,
      paths: [path],
      message: change.description ?? change.summary,
    },
    previewImmediately: false,
  };
}

export function mutationLaunchForChange(
  kind: ChangeActionKind,
  change: ChangeRow,
  changes: ChangeRow[],
): MutationLaunch {
  const destinationCommitId =
    change.parentCommitIds?.[0] ??
    changes.find(
      (candidate) =>
        candidate.commitId !== change.commitId &&
        !/^0+$/.test(candidate.commitId),
    )?.commitId ??
    "";
  const localBookmark =
    change.bookmarks.find((bookmark) => !bookmark.remote)?.name ?? "main";

  switch (kind) {
    case "edit":
      return {
        intent: { kind, targetCommitId: change.commitId },
        previewImmediately: true,
      };
    case "describe":
      return {
        intent: {
          kind,
          targetCommitId: change.commitId,
          message: change.description ?? change.summary,
        },
        previewImmediately: false,
      };
    case "rebase":
      return {
        intent: {
          kind,
          sourceCommitId: change.commitId,
          destinationCommitId,
        },
        previewImmediately: false,
      };
    case "squash":
      return {
        intent: {
          kind,
          sourceCommitId: change.commitId,
          destinationCommitId,
        },
        previewImmediately: false,
      };
    case "split":
      return {
        intent: {
          kind,
          sourceCommitId: change.commitId,
          paths: change.files.map((file) => file.path),
          message: change.description ?? change.summary,
        },
        previewImmediately: false,
      };
    case "abandon":
      return {
        intent: { kind, targetCommitIds: [change.commitId] },
        previewImmediately: true,
      };
    case "bookmarkMove":
      return {
        intent: {
          kind,
          name: localBookmark,
          targetCommitId: change.commitId,
        },
        previewImmediately: false,
      };
    case "push":
      return {
        intent: { kind, name: localBookmark, remote: "origin" },
        previewImmediately: false,
      };
  }
}
