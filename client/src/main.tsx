import "./polyfills";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The old site registered a service worker; remove it so users get the new app.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

createRoot(document.getElementById("root")!).render(<App />);
