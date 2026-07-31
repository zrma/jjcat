import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { isTauriRuntime } from "./bridge";
import { DiffQuickLookWindow } from "./components/DiffQuickLookWindow";
import { restoreAppUpdateRelaunchFocus } from "./lib/appUpdateRelaunch";
import { suppressGenericWebViewContextMenu } from "./lib/contextMenu";
import { parseDiffQuickLookRequest } from "./lib/diffQuickLook";
import "./theme.css";
import "./styles.css";

const quickLookRequest = parseDiffQuickLookRequest(window.location.search);
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    {quickLookRequest ? (
      <DiffQuickLookWindow request={quickLookRequest} />
    ) : (
      <App />
    )}
  </StrictMode>,
);

rootElement.addEventListener("contextmenu", suppressGenericWebViewContextMenu);

if (!quickLookRequest && isTauriRuntime) {
  void restoreAppUpdateRelaunchFocus(getCurrentWindow()).catch(() => {
    // The app remains usable if macOS rejects a foreground activation request.
  });
}
