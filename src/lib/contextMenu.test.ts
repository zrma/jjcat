import { describe, expect, it } from "vitest";
import { shouldPreserveNativeContextMenu } from "./contextMenu";

describe("shouldPreserveNativeContextMenu", () => {
  it("suppresses the generic WebView menu on application chrome", () => {
    expect(
      shouldPreserveNativeContextMenu({
        defaultPrevented: false,
        editableTarget: false,
      }),
    ).toBe(false);
  });

  it("preserves native editing menus", () => {
    expect(
      shouldPreserveNativeContextMenu({
        defaultPrevented: false,
        editableTarget: true,
      }),
    ).toBe(true);
  });

  it("suppresses the generic menu even when application text is selected", () => {
    expect(
      shouldPreserveNativeContextMenu({
        defaultPrevented: false,
        editableTarget: false,
      }),
    ).toBe(false);
  });

  it("does not override an application-owned context menu", () => {
    expect(
      shouldPreserveNativeContextMenu({
        defaultPrevented: true,
        editableTarget: false,
      }),
    ).toBe(true);
  });
});
