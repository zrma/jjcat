import { Cloud } from "lucide-react";
import { uniqueBookmarks } from "../lib/bookmarks";
import type { BookmarkRef } from "../types";

interface BookmarkLabelsProps {
  bookmarks: BookmarkRef[];
  limit?: number;
  emptyLabel?: string;
  className?: string;
}

export function BookmarkLabels({
  bookmarks,
  limit = Number.POSITIVE_INFINITY,
  emptyLabel,
  className = "",
}: BookmarkLabelsProps) {
  const labels = uniqueBookmarks(bookmarks);

  if (labels.length === 0) {
    return emptyLabel ? <span className="bookmark-empty">{emptyLabel}</span> : null;
  }

  const visible = labels.slice(0, limit);
  const hidden = labels.slice(limit);
  const describe = (bookmark: BookmarkRef) =>
    bookmark.remote ? `${bookmark.name}@${bookmark.remote}` : bookmark.name;

  return (
    <span
      className={`bookmark-list ${className}`.trim()}
      aria-label={`Bookmarks: ${labels.map(describe).join(", ")}`}
    >
      {visible.map((bookmark) => (
        <span
          className={`bookmark-label ${bookmark.remote ? "remote" : "local"}`}
          title={bookmark.remote ? `Remote bookmark ${describe(bookmark)}` : `Local bookmark ${bookmark.name}`}
          key={describe(bookmark)}
        >
          {bookmark.remote && <Cloud aria-hidden="true" />}
          <span>{bookmark.name}</span>
          {bookmark.remote && <small>@{bookmark.remote}</small>}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="bookmark-overflow"
          title={hidden.map(describe).join("\n")}
          aria-label={`${hidden.length} more bookmarks: ${hidden.map(describe).join(", ")}`}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
