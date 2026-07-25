import type { ChangeRow } from "../types";
import type { MutationLaunch } from "./changeActions";
import { canPreviewRebase } from "./rebaseTopology";

export type HistoryDragIntent =
  | {
      kind: "rebase";
      sourceCommitId: string;
    }
  | {
      kind: "bookmarkMove";
      name: string;
      sourceCommitId: string;
    };

export function historyDropLaunch(
  changes: ChangeRow[],
  drag: HistoryDragIntent,
  destinationCommitId: string,
): MutationLaunch | null {
  if (drag.kind === "rebase") {
    return canPreviewRebase(
      changes,
      drag.sourceCommitId,
      destinationCommitId,
    )
      ? {
          intent: {
            kind: "rebase",
            sourceCommitId: drag.sourceCommitId,
            destinationCommitId,
          },
          previewImmediately: false,
        }
      : null;
  }

  if (
    drag.sourceCommitId === destinationCommitId ||
    /^0+$/.test(destinationCommitId)
  ) {
    return null;
  }

  const source = changes.find(
    (change) => change.commitId === drag.sourceCommitId,
  );
  const destination = changes.find(
    (change) => change.commitId === destinationCommitId,
  );
  const localBookmarkStillExists = source?.bookmarks.some(
    (bookmark) => bookmark.remote === null && bookmark.name === drag.name,
  );

  if (!destination || !localBookmarkStillExists) return null;

  return {
    intent: {
      kind: "bookmarkMove",
      name: drag.name,
      targetCommitId: destinationCommitId,
    },
    previewImmediately: true,
  };
}
