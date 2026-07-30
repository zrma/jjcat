import { describe, expect, it } from "vitest";
import { parseDiffViewerPreferenceChange } from "./useDiffViewerPreferences";

describe("diff viewer preference synchronization", () => {
  it("accepts either or both shared preference fields", () => {
    expect(
      parseDiffViewerPreferenceChange({ viewMode: "sideBySide" }),
    ).toEqual({ viewMode: "sideBySide" });
    expect(
      parseDiffViewerPreferenceChange({ whitespaceMode: "ignoreAll" }),
    ).toEqual({ whitespaceMode: "ignoreAll" });
    expect(
      parseDiffViewerPreferenceChange({
        viewMode: "unified",
        whitespaceMode: "preserve",
      }),
    ).toEqual({
      viewMode: "unified",
      whitespaceMode: "preserve",
    });
  });

  it("rejects malformed cross-window preference events", () => {
    expect(parseDiffViewerPreferenceChange(null)).toBeNull();
    expect(parseDiffViewerPreferenceChange({})).toBeNull();
    expect(
      parseDiffViewerPreferenceChange({ viewMode: "side-by-side" }),
    ).toBeNull();
    expect(
      parseDiffViewerPreferenceChange({
        viewMode: "unified",
        whitespaceMode: "ignore-leading",
      }),
    ).toBeNull();
  });
});
