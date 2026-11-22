import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { initAccentColor } from "./lib/accentTheme";
import "./index.css";

// Initialize user selected accent color immediately
initAccentColor();

// Global JS error catcher — renders a visible error instead of black screen
window.onerror = (message, _source, _lineno, _colno, error) => {
  const root = document.getElementById("root");
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="color:#C95858;padding:32px;font-family:monospace;font-size:12px;background:#0C0D0F;height:100vh">
      <b style="color:#E8923A">KuroRelay — Runtime Error</b><br/><br/>
      ${String(message)}<br/><br/>
      ${error?.stack ? error.stack.replace(/\n/g, "<br/>") : ""}
    </div>`;
  }
};

window.addEventListener("unhandledrejection", (e) => {
  console.error("[KuroRelay] Unhandled promise rejection:", e.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Application Error">
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
