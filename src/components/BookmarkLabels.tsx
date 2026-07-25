import { Cloud, GitBranch } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { groupBookmarksAtRevision, uniqueBookmarks } from "../lib/bookmarks";
import type { BookmarkRef } from "../types";

export interface LocalBookmarkDragHandlers {
  activeName: string | null;
  onPointerDown: (
    bookmark: BookmarkRef,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

interface BookmarkLabelsProps {
  bookmarks: BookmarkRef[];
  limit?: number;
  emptyLabel?: string;
  className?: string;
  localBookmarkDrag?: LocalBookmarkDragHandlers;
}

export function BookmarkLabels({
  bookmarks,
  limit = Number.POSITIVE_INFINITY,
  emptyLabel,
  className = "",
  localBookmarkDrag,
}: BookmarkLabelsProps) {
  const labels = uniqueBookmarks(bookmarks);
  const groups = groupBookmarksAtRevision(labels);

  if (labels.length === 0) {
    return emptyLabel ? <span className="bookmark-empty">{emptyLabel}</span> : null;
  }

  const visible = groups.slice(0, limit);
  const hidden = groups.slice(limit);
  const describe = (bookmark: BookmarkRef) =>
    bookmark.remote ? `${bookmark.name}@${bookmark.remote}` : bookmark.name;

  return (
    <span
      className={`bookmark-list ${className}`.trim()}
      aria-label={`Bookmarks: ${labels.map(describe).join(", ")}`}
    >
      {visible.map(({ primary, alignedRemotes }) => {
        const title = primary.remote
          ? `Remote bookmark ${describe(primary)}`
          : `Local bookmark ${primary.name}${
              alignedRemotes.length > 0
                ? `; aligned with ${alignedRemotes.map(describe).join(", ")}`
                : ""
            }`;
        const contents = (
          <>
            {primary.remote && <Cloud aria-hidden="true" />}
            <span>{primary.name}</span>
            {primary.remote && <small>@{primary.remote}</small>}
            {alignedRemotes.length > 0 && (
              <span className="bookmark-aligned-markers" aria-hidden="true">
                {alignedRemotes.map((remote) => (
                  <span
                    className={`bookmark-aligned-marker ${remote.remote === "git" ? "git" : "network"}`}
                    title={
                      remote.remote === "git"
                        ? `Git branch ${describe(remote)} is at this revision`
                        : `Remote bookmark ${describe(remote)} is at this revision (last fetched)`
                    }
                    key={describe(remote)}
                  >
                    {remote.remote === "git" ? <GitBranch /> : <Cloud />}
                  </span>
                ))}
              </span>
            )}
          </>
        );

        return primary.remote === null && localBookmarkDrag ? (
          <button
            type="button"
            className={`bookmark-label local movable ${localBookmarkDrag.activeName === primary.name ? "dragging" : ""}`}
            title={`${title}. Drag onto another change to preview moving it.`}
            aria-label={`Move local bookmark ${primary.name}`}
            aria-grabbed={localBookmarkDrag.activeName === primary.name}
            data-bookmark-name={primary.name}
            onPointerDown={(event) =>
              localBookmarkDrag.onPointerDown(primary, event)
            }
            onPointerMove={localBookmarkDrag.onPointerMove}
            onPointerUp={localBookmarkDrag.onPointerUp}
            onPointerCancel={localBookmarkDrag.onPointerCancel}
            key={describe(primary)}
          >
            {contents}
          </button>
        ) : (
          <span
            className={`bookmark-label ${primary.remote ? "remote" : "local"}`}
            title={title}
            key={describe(primary)}
          >
            {contents}
          </span>
        );
      })}
      {hidden.length > 0 && (
        <span
          className="bookmark-overflow"
          title={hidden.map(({ primary }) => describe(primary)).join("\n")}
          aria-label={`${hidden.length} more bookmark positions: ${hidden
            .map(({ primary }) => describe(primary))
            .join(", ")}`}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
