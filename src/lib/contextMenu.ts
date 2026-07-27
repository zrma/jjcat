const EDITABLE_CONTEXT_MENU_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[data-native-context-menu]",
].join(", ");

export interface ContextMenuPolicyInput {
  defaultPrevented: boolean;
  editableTarget: boolean;
}

export function shouldPreserveNativeContextMenu({
  defaultPrevented,
  editableTarget,
}: ContextMenuPolicyInput): boolean {
  return defaultPrevented || editableTarget;
}

function contextMenuElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function isEditableContextMenuTarget(target: EventTarget | null): boolean {
  return contextMenuElement(target)?.closest(EDITABLE_CONTEXT_MENU_SELECTOR) != null;
}

export function suppressGenericWebViewContextMenu(event: MouseEvent): void {
  const preserveNativeMenu = shouldPreserveNativeContextMenu({
    defaultPrevented: event.defaultPrevented,
    editableTarget: isEditableContextMenuTarget(event.target),
  });

  if (!preserveNativeMenu) {
    event.preventDefault();
  }
}
