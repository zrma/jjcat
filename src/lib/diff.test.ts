import { describe, expect, it } from "vitest";
import type { DiffLine } from "../types";
import { pairSideBySide } from "./diff";

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
