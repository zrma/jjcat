import type { MutationKind } from "../types";

export type MutationDecision = "execute" | "cancel";

const KEYBOARD_CONFIRMABLE_ACTIONS = new Set<MutationKind>([
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
]);

export function supportsMutationDecisionShortcuts(kind: MutationKind) {
  return KEYBOARD_CONFIRMABLE_ACTIONS.has(kind);
}

export function mutationDecisionForKey(
  kind: MutationKind,
  key: string,
  executeEnabled: boolean,
): MutationDecision | null {
  if (!supportsMutationDecisionShortcuts(kind)) return null;

  const normalized = key.toLowerCase();
  if (key === "Enter" || normalized === "y") {
    return executeEnabled ? "execute" : null;
  }
  if (key === "Escape" || normalized === "n") return "cancel";
  return null;
}
