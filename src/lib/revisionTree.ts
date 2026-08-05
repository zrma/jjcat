import type { RevisionTreeEntry } from "../types";

export interface RevisionTreeNode {
  name: string;
  path: string;
  children: Map<string, RevisionTreeNode>;
  entry?: RevisionTreeEntry;
}

export function buildRevisionTree(entries: RevisionTreeEntry[]) {
  const root: RevisionTreeNode = { name: "", path: "", children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    for (const [index, part] of parts.entries()) {
      const path = parts.slice(0, index + 1).join("/");
      const child = node.children.get(part) ?? {
        name: part,
        path,
        children: new Map<string, RevisionTreeNode>(),
      };
      node.children.set(part, child);
      node = child;
    }
    node.entry = entry;
  }
  return root;
}

export function sortedRevisionChildren(node: RevisionTreeNode) {
  return [...node.children.values()].sort((left, right) => {
    const leftDirectory = left.children.size > 0;
    const rightDirectory = right.children.size > 0;
    if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
