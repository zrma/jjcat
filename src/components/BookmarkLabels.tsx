import { uniqueBookmarks } from "../lib/bookmarks";

interface BookmarkLabelsProps {
  bookmarks: string[];
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

  return (
    <span
      className={`bookmark-list ${className}`.trim()}
      aria-label={`Bookmarks: ${labels.join(", ")}`}
    >
      {visible.map((bookmark) => (
        <span className="bookmark-label" title={bookmark} key={bookmark}>
          {bookmark}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="bookmark-overflow"
          title={hidden.join("\n")}
          aria-label={`${hidden.length} more bookmarks: ${hidden.join(", ")}`}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
