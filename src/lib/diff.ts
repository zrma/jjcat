import type { DiffLine } from "../types";

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export function pairSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === "context" || line.kind === "metadata") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    if (line.kind === "addition") {
      rows.push({ left: null, right: line });
      index += 1;
      continue;
    }

    const deletions: DiffLine[] = [];
    while (lines[index]?.kind === "deletion") {
      deletions.push(lines[index]);
      index += 1;
    }
    const additions: DiffLine[] = [];
    while (lines[index]?.kind === "addition") {
      additions.push(lines[index]);
      index += 1;
    }
    const count = Math.max(deletions.length, additions.length);
    for (let pair = 0; pair < count; pair += 1) {
      rows.push({ left: deletions[pair] ?? null, right: additions[pair] ?? null });
    }
  }
  return rows;
}
