import {
  Code2,
  Copy,
  FolderSearch,
  Maximize2,
  Scissors,
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { ChangedFile } from "../types";

interface FileContextMenuProps {
  file: ChangedFile;
  x: number;
  y: number;
  canReveal: boolean;
  canSplit: boolean;
  onOpenDiff: () => void;
  onOpenEditor: () => void;
  onReveal: () => void;
  onSplit: () => void;
  onCopyPath: () => void;
  onClose: () => void;
}

function MenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  title,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>, direction: 1 | -1) {
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    ),
  );
  if (items.length === 0) return;
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex =
    currentIndex < 0
      ? direction > 0
        ? 0
        : items.length - 1
      : (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
}

export function FileContextMenu({
  file,
  x,
  y,
  canReveal,
  canSplit,
  onOpenDiff,
  onOpenEditor,
  onReveal,
  onSplit,
  onCopyPath,
  onClose,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
  }, [file.path]);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      role="menu"
      aria-label={`Actions for ${file.path}`}
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveMenuFocus(event, event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
          event.preventDefault();
          run(onCopyPath);
        }
      }}
    >
      <MenuItem
        icon={<Maximize2 aria-hidden="true" />}
        label="Open Diff"
        shortcut="Space"
        onSelect={() => run(onOpenDiff)}
      />
      <MenuItem
        icon={<Code2 aria-hidden="true" />}
        label="Open in VS Code"
        onSelect={() => run(onOpenEditor)}
      />
      <MenuItem
        icon={<FolderSearch aria-hidden="true" />}
        label="Show in Finder"
        disabled={!canReveal}
        title={canReveal ? undefined : "Available for local repositories only"}
        onSelect={() => run(onReveal)}
      />
      <span className="menu-separator" role="separator" />
      <MenuItem
        icon={<Scissors aria-hidden="true" />}
        label="Split This File…"
        disabled={!canSplit}
        title={canSplit ? undefined : "The root change is immutable"}
        onSelect={() => run(onSplit)}
      />
      <span className="menu-separator" role="separator" />
      <MenuItem
        icon={<Copy aria-hidden="true" />}
        label="Copy Path"
        shortcut="⌘C"
        onSelect={() => run(onCopyPath)}
      />
    </div>
  );
}
