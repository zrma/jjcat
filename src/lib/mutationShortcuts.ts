import type { MutationKind } from "../types";

export type MutationDecision = "execute" | "cancel";

const OPERATION_RECOVERABLE_ACTIONS = new Set<MutationKind>([
  "new",
  "edit",
  "describe",
  "fetch",
  "rebase",
  "squash",
  "split",
  "abandon",
  "pruneEmpty",
  "undo",
  "redo",
  "bookmarkMove",
]);

export function supportsMutationDecisionShortcuts(kind: MutationKind) {
  return OPERATION_RECOVERABLE_ACTIONS.has(kind);
}

export function requiresExplicitPointerConfirmation(kind: MutationKind) {
  return !supportsMutationDecisionShortcuts(kind);
}

export function mutationDecisionForKey(
  kind: MutationKind,
  key: string,
  executeEnabled: boolean,
): MutationDecision | null {
  const normalized = key.toLowerCase();
  if (key === "Escape" || normalized === "n") return "cancel";
  if (!supportsMutationDecisionShortcuts(kind)) return null;
  if (key === "Enter" || normalized === "y") {
    return executeEnabled ? "execute" : null;
  }
  return null;
}
