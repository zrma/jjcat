import type { BookmarkRef } from "../types";

export interface BookmarkLabelGroup {
  primary: BookmarkRef;
  alignedRemotes: BookmarkRef[];
}

export function uniqueBookmarks(bookmarks: BookmarkRef[]) {
  const seen = new Set<string>();
  return bookmarks.filter((bookmark) => {
    const key = `${bookmark.name}\0${bookmark.remote ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupBookmarksAtRevision(bookmarks: BookmarkRef[]): BookmarkLabelGroup[] {
  const unique = uniqueBookmarks(bookmarks);
  const localNames = new Set(
    unique.filter((bookmark) => bookmark.remote === null).map((bookmark) => bookmark.name),
  );
  const alignedRemotes = new Map<string, BookmarkRef[]>();

  for (const bookmark of unique) {
    if (bookmark.remote === null || !localNames.has(bookmark.name)) continue;
    const aligned = alignedRemotes.get(bookmark.name);
    if (aligned) aligned.push(bookmark);
    else alignedRemotes.set(bookmark.name, [bookmark]);
  }

  return unique.flatMap((bookmark) => {
    if (bookmark.remote !== null && localNames.has(bookmark.name)) return [];
    return [
      {
        primary: bookmark,
        alignedRemotes:
          bookmark.remote === null ? (alignedRemotes.get(bookmark.name) ?? []) : [],
      },
    ];
  });
}
