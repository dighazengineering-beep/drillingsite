import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { applyLite } from "./lib/lite";
import "./lib/install";

applyLite();

const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById("root")!).render(<App />);

// Wake the server the moment anyone opens the site, so it is ready before they pay or sign in.
try { fetch(`${((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "")}/api/healthz`, { cache: "no-store" }).catch(() => {}); } catch { /* ignore */ }

// Makes the site installable as an app (see public/sw.js)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
