import type { DiffLine } from "../types";

const MAX_INTRALINE_CHARACTERS = 2_048;
const MAX_SEQUENCE_CELLS = 200_000;
const MAX_INTRALINE_CELLS_PER_HUNK = 1_000_000;
const MIN_VISIBLE_SIMILARITY = 0.3;

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

export interface IntralineSegment {
  text: string;
  changed: boolean;
}

type SequenceEdit = {
  kind: "equal" | "deletion" | "addition";
  value: string;
};

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

export function calculateSynchronizedScrollLeft(
  sourceScrollLeft: number,
  sourceScrollRange: number,
  targetScrollRange: number,
): number {
  if (
    !Number.isFinite(sourceScrollLeft) ||
    !Number.isFinite(sourceScrollRange) ||
    !Number.isFinite(targetScrollRange) ||
    sourceScrollRange <= 0 ||
    targetScrollRange <= 0
  ) {
    return 0;
  }

  const progress = Math.max(
    0,
    Math.min(1, sourceScrollLeft / sourceScrollRange),
  );
  return progress * targetScrollRange;
}

export function intralineSegmentsForLines(
  lines: DiffLine[],
): Array<IntralineSegment[] | null> {
  const annotations: Array<IntralineSegment[] | null> = lines.map(() => null);
  const budget = { remainingCells: MAX_INTRALINE_CELLS_PER_HUNK };
  let index = 0;

  while (index < lines.length) {
    if (lines[index].kind !== "deletion") {
      index += 1;
      continue;
    }

    const deletionIndexes: number[] = [];
    while (lines[index]?.kind === "deletion") {
      deletionIndexes.push(index);
      index += 1;
    }

    const additionIndexes: number[] = [];
    while (lines[index]?.kind === "addition") {
      additionIndexes.push(index);
      index += 1;
    }

    const pairCount = Math.min(
      deletionIndexes.length,
      additionIndexes.length,
    );
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const deletionIndex = deletionIndexes[pairIndex];
      const additionIndex = additionIndexes[pairIndex];
      const pair = calculateIntralinePair(
        lines[deletionIndex].content,
        lines[additionIndex].content,
        budget,
      );
      if (!pair) continue;
      annotations[deletionIndex] = pair.before;
      annotations[additionIndex] = pair.after;
    }
  }

  return annotations;
}

function calculateIntralinePair(
  before: string,
  after: string,
  budget: { remainingCells: number },
): { before: IntralineSegment[]; after: IntralineSegment[] } | null {
  if (
    before === after ||
    before.length > MAX_INTRALINE_CHARACTERS ||
    after.length > MAX_INTRALINE_CHARACTERS
  ) {
    return null;
  }

  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  const wordCells = sequenceCellCount(beforeTokens, afterTokens);
  if (wordCells > budget.remainingCells) return null;
  const wordEdits = sequenceDiff(beforeTokens, afterTokens);
  if (!wordEdits) return null;
  budget.remainingCells -= wordCells;

  const beforeSegments: IntralineSegment[] = [];
  const afterSegments: IntralineSegment[] = [];
  let deletedText = "";
  let addedText = "";

  const flushChangedText = () => {
    if (!deletedText && !addedText) return;
    const deletedCharacters = Array.from(deletedText);
    const addedCharacters = Array.from(addedText);
    const characterCells = sequenceCellCount(
      deletedCharacters,
      addedCharacters,
    );
    const characterEdits =
      characterCells <= budget.remainingCells
        ? sequenceDiff(deletedCharacters, addedCharacters)
        : null;
    if (characterEdits) {
      budget.remainingCells -= characterCells;
    }
    const changedVisibleLength = Math.max(
      visibleCharacterCount(deletedText),
      visibleCharacterCount(addedText),
    );
    const sharedChangedVisibleLength =
      characterEdits?.reduce(
        (count, edit) =>
          edit.kind === "equal"
            ? count + visibleCharacterCount(edit.value)
            : count,
        0,
      ) ?? 0;
    if (
      !characterEdits ||
      changedVisibleLength === 0 ||
      sharedChangedVisibleLength / changedVisibleLength < 0.5
    ) {
      appendSegment(beforeSegments, deletedText, true);
      appendSegment(afterSegments, addedText, true);
    } else {
      for (const edit of characterEdits) {
        if (edit.kind !== "addition") {
          appendSegment(
            beforeSegments,
            edit.value,
            edit.kind === "deletion",
          );
        }
        if (edit.kind !== "deletion") {
          appendSegment(
            afterSegments,
            edit.value,
            edit.kind === "addition",
          );
        }
      }
    }
    deletedText = "";
    addedText = "";
  };

  for (const edit of wordEdits) {
    if (edit.kind === "equal") {
      flushChangedText();
      appendSegment(beforeSegments, edit.value, false);
      appendSegment(afterSegments, edit.value, false);
    } else if (edit.kind === "deletion") {
      deletedText += edit.value;
    } else {
      addedText += edit.value;
    }
  }
  flushChangedText();

  const visibleLength = Math.max(
    visibleCharacterCount(before),
    visibleCharacterCount(after),
  );
  const sharedVisibleLength = beforeSegments.reduce(
    (count, segment) =>
      segment.changed ? count : count + visibleCharacterCount(segment.text),
    0,
  );
  if (
    visibleLength === 0 ||
    sharedVisibleLength < 2 ||
    sharedVisibleLength / visibleLength < MIN_VISIBLE_SIMILARITY
  ) {
    return null;
  }

  return { before: beforeSegments, after: afterSegments };
}

function tokenize(value: string): string[] {
  return (
    value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? [value]
  );
}

function sequenceDiff(
  before: string[],
  after: string[],
): SequenceEdit[] | null {
  const width = after.length + 1;
  const cells = sequenceCellCount(before, after);
  if (cells > MAX_SEQUENCE_CELLS) return null;

  const lengths = new Uint16Array(cells);
  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      const offset = beforeIndex * width + afterIndex;
      lengths[offset] =
        before[beforeIndex] === after[afterIndex]
          ? lengths[(beforeIndex + 1) * width + afterIndex + 1] + 1
          : Math.max(
              lengths[(beforeIndex + 1) * width + afterIndex],
              lengths[beforeIndex * width + afterIndex + 1],
            );
    }
  }

  const edits: SequenceEdit[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      edits.push({ kind: "equal", value: before[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      lengths[(beforeIndex + 1) * width + afterIndex] >=
      lengths[beforeIndex * width + afterIndex + 1]
    ) {
      edits.push({ kind: "deletion", value: before[beforeIndex] });
      beforeIndex += 1;
    } else {
      edits.push({ kind: "addition", value: after[afterIndex] });
      afterIndex += 1;
    }
  }
  while (beforeIndex < before.length) {
    edits.push({ kind: "deletion", value: before[beforeIndex] });
    beforeIndex += 1;
  }
  while (afterIndex < after.length) {
    edits.push({ kind: "addition", value: after[afterIndex] });
    afterIndex += 1;
  }
  return edits;
}

function sequenceCellCount(before: string[], after: string[]): number {
  return (before.length + 1) * (after.length + 1);
}

function appendSegment(
  segments: IntralineSegment[],
  text: string,
  changed: boolean,
) {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.changed === changed) {
    previous.text += text;
  } else {
    segments.push({ text, changed });
  }
}

function visibleCharacterCount(value: string): number {
  return Array.from(value).filter((character) => !/\s/u.test(character)).length;
}
