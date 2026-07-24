import {
  ArrowUpToLine,
  GitBranchPlus,
  GitFork,
  ListRestart,
  PencilLine,
  Scissors,
  Trash2,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  mutationLaunchForChange,
  type ChangeActionKind,
  type MutationLaunch,
} from "../lib/changeActions";
import type { ChangeRow } from "../types";

interface ChangeActionMenuProps {
  change: ChangeRow;
  changes: ChangeRow[];
  x: number;
  y: number;
  onClose: () => void;
  onLaunch: (launch: MutationLaunch) => void;
}

interface ActionItem {
  kind: ChangeActionKind;
  label: string;
  description: string;
  icon: ReactNode;
  dangerous?: boolean;
}

const ACTION_GROUPS: { label: string; actions: ActionItem[] }[] = [
  {
    label: "Working copy",
    actions: [
      {
        kind: "edit",
        label: "Edit this change",
        description: "Make this change the active working copy",
        icon: <PencilLine aria-hidden="true" />,
      },
      {
        kind: "describe",
        label: "Describe change…",
        description: "Edit the full description and trailers",
        icon: <ListRestart aria-hidden="true" />,
      },
    ],
  },
  {
    label: "Shape history",
    actions: [
      {
        kind: "rebase",
        label: "Rebase onto…",
        description: "Choose a new parent for this change",
        icon: <GitFork aria-hidden="true" />,
      },
      {
        kind: "squash",
        label: "Squash into…",
        description: "Fold this change into another change",
        icon: <Waypoints aria-hidden="true" />,
      },
      {
        kind: "split",
        label: "Split paths…",
        description: "Move selected files into a new change",
        icon: <Scissors aria-hidden="true" />,
      },
      {
        kind: "abandon",
        label: "Abandon change…",
        description: "Preview removal of this exact change",
        icon: <Trash2 aria-hidden="true" />,
        dangerous: true,
      },
    ],
  },
  {
    label: "Bookmarks",
    actions: [
      {
        kind: "bookmarkMove",
        label: "Move bookmark here…",
        description: "Choose a local bookmark to move",
        icon: <GitBranchPlus aria-hidden="true" />,
      },
      {
        kind: "push",
        label: "Push bookmark…",
        description: "Preview an explicit remote bookmark push",
        icon: <ArrowUpToLine aria-hidden="true" />,
      },
    ],
  },
];

export function ChangeActionMenu({
  change,
  changes,
  x,
  y,
  onClose,
  onLaunch,
}: ChangeActionMenuProps) {
  const root = /^0+$/.test(change.commitId);

  return (
    <div
      className="change-action-menu"
      role="menu"
      aria-label={`Actions for change ${change.changeId}`}
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header>
        <span>Selected change</span>
        <code>{change.changeId}</code>
      </header>
      {ACTION_GROUPS.map((group) => (
        <section aria-label={group.label} key={group.label}>
          <h3>{group.label}</h3>
          {group.actions.map((action) => {
            const disabled =
              root &&
              !["bookmarkMove", "push"].includes(action.kind);
            return (
              <button
                type="button"
                role="menuitem"
                className={action.dangerous ? "danger" : ""}
                disabled={disabled}
                onClick={() => {
                  onLaunch(
                    mutationLaunchForChange(action.kind, change, changes),
                  );
                  onClose();
                }}
                key={action.kind}
              >
                {action.icon}
                <span>
                  <strong>{action.label}</strong>
                  <small>
                    {disabled
                      ? "The root change is immutable"
                      : action.description}
                  </small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
