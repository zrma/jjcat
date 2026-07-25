import { describe, expect, it } from "vitest";
import {
  mutationDecisionForKey,
  supportsMutationDecisionShortcuts,
} from "./mutationShortcuts";
import type { MutationKind } from "../types";

const recoverableKinds: MutationKind[] = [
  "new",
  "edit",
  "describe",
  "fetch",
  "rebase",
  "squash",
  "split",
  "abandon",
  "pruneEmpty",
  "bookmarkMove",
];

describe("mutation confirmation shortcuts", () => {
  it.each(recoverableKinds)(
    "supports execute and cancel keys for recoverable %s operations",
    (kind) => {
      expect(supportsMutationDecisionShortcuts(kind)).toBe(true);
      expect(mutationDecisionForKey(kind, "Enter", true)).toBe("execute");
      expect(mutationDecisionForKey(kind, "y", true)).toBe("execute");
      expect(mutationDecisionForKey(kind, "Y", true)).toBe("execute");
      expect(mutationDecisionForKey(kind, "Escape", true)).toBe("cancel");
      expect(mutationDecisionForKey(kind, "n", true)).toBe("cancel");
      expect(mutationDecisionForKey(kind, "N", true)).toBe("cancel");
    },
  );

  it.each<MutationKind>(["removeWorkspace", "push", "undo", "redo"])(
    "does not intercept decision keys for non-confirmable %s operations",
    (kind) => {
      expect(supportsMutationDecisionShortcuts(kind)).toBe(false);
      expect(mutationDecisionForKey(kind, "Enter", true)).toBeNull();
      expect(mutationDecisionForKey(kind, "Y", true)).toBeNull();
      expect(mutationDecisionForKey(kind, "Escape", true)).toBeNull();
      expect(mutationDecisionForKey(kind, "N", true)).toBeNull();
    },
  );

  it("blocks execute keys while execution is unavailable but still permits cancel", () => {
    expect(mutationDecisionForKey("pruneEmpty", "Enter", false)).toBeNull();
    expect(mutationDecisionForKey("pruneEmpty", "Y", false)).toBeNull();
    expect(mutationDecisionForKey("pruneEmpty", "Escape", false)).toBe("cancel");
    expect(mutationDecisionForKey("pruneEmpty", "N", false)).toBe("cancel");
  });

  it("ignores unrelated keys", () => {
    expect(mutationDecisionForKey("rebase", "r", true)).toBeNull();
    expect(mutationDecisionForKey("rebase", " ", true)).toBeNull();
  });
});
