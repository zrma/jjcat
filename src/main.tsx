import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DiffQuickLookWindow } from "./components/DiffQuickLookWindow";
import { clearLegacyAppUpdateRelaunchFocus } from "./lib/appUpdateLegacy";
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

if (!quickLookRequest) {
  clearLegacyAppUpdateRelaunchFocus();
}
