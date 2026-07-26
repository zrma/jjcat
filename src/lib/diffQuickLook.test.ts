import { describe, expect, it } from "vitest";
import {
  DIFF_QUICK_LOOK_WINDOW_OPTIONS,
  diffQuickLookUrl,
  parseDiffQuickLookRequest,
  type DiffQuickLookRequest,
} from "./diffQuickLook";

const request: DiffQuickLookRequest = {
  repositoryId: "repo-local",
  repositoryName: "jjcat",
  changeId: "change-id",
  commitId: "commit-id",
  selectedFilePath: "src/components/Change Workspace.tsx",
  viewMode: "sideBySide",
  whitespaceMode: "ignoreAll",
};

describe("diff Quick Look location", () => {
  it("round-trips a request through the dedicated window URL", () => {
    const url = new URL(diffQuickLookUrl(request), "http://localhost/");
    expect(parseDiffQuickLookRequest(url.search)).toEqual(request);
  });

  it("ignores the main application URL and malformed requests", () => {
    expect(parseDiffQuickLookRequest("")).toBeNull();
    expect(
      parseDiffQuickLookRequest("?window=diff-quick-look&repositoryId=repo"),
    ).toBeNull();
  });

  it("keeps the native window movable and resizable", () => {
    expect(DIFF_QUICK_LOOK_WINDOW_OPTIONS.decorations).toBe(true);
    expect(DIFF_QUICK_LOOK_WINDOW_OPTIONS.resizable).toBe(true);
    expect(DIFF_QUICK_LOOK_WINDOW_OPTIONS.minWidth).toBeGreaterThan(0);
    expect(DIFF_QUICK_LOOK_WINDOW_OPTIONS.minHeight).toBeGreaterThan(0);
  });
});
