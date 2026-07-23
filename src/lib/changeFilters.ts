import type { ChangeRow } from "../types";

export type HistoryView =
  | "all"
  | "working-copy"
  | "bookmarks"
  | "remote-bookmarks"
  | "conflicts";

export function filterChanges(
  changes: ChangeRow[],
  historyView: HistoryView,
  searchQuery: string,
) {
  const query = searchQuery.trim().toLocaleLowerCase();
  return changes.filter((change) => {
    if (historyView === "working-copy" && !change.workingCopy) return false;
    if (
      historyView === "bookmarks" &&
      !change.bookmarks.some((bookmark) => bookmark.remote === null)
    ) {
      return false;
    }
    if (
      historyView === "remote-bookmarks" &&
      !change.bookmarks.some((bookmark) => bookmark.remote !== null)
    ) {
      return false;
    }
    if (historyView === "conflicts" && !change.conflict) return false;
    if (!query) return true;
    return [
      change.summary,
      change.description ?? "",
      change.author,
      change.authorEmail ?? "",
      change.committer ?? "",
      change.committerEmail ?? "",
      change.changeId,
      change.commitId,
      ...change.bookmarks.flatMap((bookmark) => [bookmark.name, bookmark.remote ?? ""]),
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}
