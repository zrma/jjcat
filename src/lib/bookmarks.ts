import type { BookmarkRef } from "../types";

export function uniqueBookmarks(bookmarks: BookmarkRef[]) {
  const seen = new Set<string>();
  return bookmarks.filter((bookmark) => {
    const key = `${bookmark.name}\0${bookmark.remote ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
