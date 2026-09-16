import "./polyfills";
import { createRoot } from "react-dom/client";
import "./index.css";

// The old site registered a service worker; remove it so users get the new app.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

async function boot() {
  const root = createRoot(document.getElementById("root")!);
  const config = await fetch("/api/config").then((r) => r.json()).catch(() => ({}));
  if (!config.reownProjectId) {
    root.render(
      <div style={{ color: "white", padding: 24, fontFamily: "sans-serif" }}>
        Wallet connection is not configured (REOWN_PROJECT_ID missing).
      </div>,
    );
    return;
  }
  const { initReown } = await import("./lib/wallet");
  initReown(config.reownProjectId);
  const { default: App } = await import("./App");
  root.render(<App />);
}

boot();
