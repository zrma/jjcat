import { describe, expect, it } from "vitest";
import { historyShortcutFor } from "./historyShortcuts";

function shortcut(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>,
) {
  return historyShortcutFor({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  });
}

describe("historyShortcutFor", () => {
  it("maps platform undo shortcuts to one operation step", () => {
    expect(shortcut("z", { metaKey: true })).toBe("undo");
    expect(shortcut("Z", { ctrlKey: true })).toBe("undo");
  });

  it("accepts both common redo shortcut families", () => {
    expect(shortcut("z", { metaKey: true, shiftKey: true })).toBe("redo");
    expect(shortcut("z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(shortcut("y", { ctrlKey: true })).toBe("redo");
    expect(shortcut("y", { metaKey: true })).toBe("redo");
  });

  it("does not claim unrelated or alternate-modified shortcuts", () => {
    expect(shortcut("z", {})).toBeNull();
    expect(shortcut("z", { ctrlKey: true, altKey: true })).toBeNull();
    expect(shortcut("y", { ctrlKey: true, shiftKey: true })).toBeNull();
  });
});
