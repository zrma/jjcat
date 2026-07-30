import { describe, expect, it } from "vitest";
import type { DiffLine } from "../types";
import {
  calculateSynchronizedScrollLeft,
  intralineSegmentsForLines,
  pairSideBySide,
} from "./diff";

function line(kind: DiffLine["kind"], content: string): DiffLine {
  return { kind, content, oldLine: null, newLine: null };
}

describe("pairSideBySide", () => {
  it("aligns replacement blocks before continuing with context", () => {
    const rows = pairSideBySide([
      line("context", "before"),
      line("deletion", "old one"),
      line("deletion", "old two"),
      line("addition", "new one"),
      line("context", "after"),
    ]);

    expect(rows.map(({ left, right }) => [left?.content, right?.content])).toEqual([
      ["before", "before"],
      ["old one", "new one"],
      ["old two", undefined],
      ["after", "after"],
    ]);
  });

  it("keeps standalone additions on the right", () => {
    expect(pairSideBySide([line("addition", "new")])).toEqual([
      { left: null, right: line("addition", "new") },
    ]);
  });
});

describe("calculateSynchronizedScrollLeft", () => {
  it("keeps panes at the same relative horizontal position", () => {
    expect(calculateSynchronizedScrollLeft(120, 240, 400)).toBe(200);
    expect(calculateSynchronizedScrollLeft(240, 240, 400)).toBe(400);
  });

  it("clamps stale metrics and panes without overflow", () => {
    expect(calculateSynchronizedScrollLeft(-10, 240, 400)).toBe(0);
    expect(calculateSynchronizedScrollLeft(300, 240, 400)).toBe(400);
    expect(calculateSynchronizedScrollLeft(120, 0, 400)).toBe(0);
    expect(calculateSynchronizedScrollLeft(120, 240, 0)).toBe(0);
  });
});

describe("intralineSegmentsForLines", () => {
  it("highlights the changed word while preserving surrounding syntax", () => {
    const segments = intralineSegmentsForLines([
      line("deletion", 'const mode = "legacy";'),
      line("addition", 'const mode = "jjcat";'),
    ]);

    expect(segments[0]?.map(({ text, changed }) => [text, changed])).toEqual([
      ['const mode = "', false],
      ["legacy", true],
      ['";', false],
    ]);
    expect(segments[1]?.map(({ text, changed }) => [text, changed])).toEqual([
      ['const mode = "', false],
      ["jjcat", true],
      ['";', false],
    ]);
  });

  it("refines an edited identifier down to the added character", () => {
    const segments = intralineSegmentsForLines([
      line("deletion", "const repositoryCount = 1;"),
      line("addition", "const repositoryCounts = 1;"),
    ]);

    expect(segments[0]?.some(({ changed }) => changed)).toBe(false);
    expect(
      segments[1]
        ?.filter(({ changed }) => changed)
        .map(({ text }) => text)
        .join(""),
    ).toBe("s");
  });

  it("pairs each deletion and addition in a replacement block", () => {
    const segments = intralineSegmentsForLines([
      line("deletion", "const first = false;"),
      line("deletion", "const second = false;"),
      line("addition", "const first = true;"),
      line("addition", "const second = true;"),
    ]);

    expect(segments).toHaveLength(4);
    expect(segments.every((segment) => segment !== null)).toBe(true);
    expect(
      segments.map((segment) =>
        segment
          ?.filter(({ changed }) => changed)
          .map(({ text }) => text)
          .join(""),
      ),
    ).toEqual(["false", "false", "true", "true"]);
  });

  it("falls back to whole-line styling for unrelated or excessively long lines", () => {
    const unrelated = intralineSegmentsForLines([
      line("deletion", "alpha"),
      line("addition", "omega"),
    ]);
    const long = "x".repeat(2_100);
    const excessive = intralineSegmentsForLines([
      line("deletion", `${long}a`),
      line("addition", `${long}b`),
    ]);

    expect(unrelated).toEqual([null, null]);
    expect(excessive).toEqual([null, null]);
  });

  it("caps the total comparison work across one hunk", () => {
    const shared = "x ".repeat(200);
    const deletions = Array.from({ length: 8 }, (_, index) =>
      line("deletion", `${shared}old${index}`),
    );
    const additions = Array.from({ length: 8 }, (_, index) =>
      line("addition", `${shared}new${index}`),
    );
    const segments = intralineSegmentsForLines([...deletions, ...additions]);

    expect(segments[0]).not.toBeNull();
    expect(segments.at(-1)).toBeNull();
  });
});
