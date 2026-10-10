import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorCapture } from "./lib/audit/globalErrorCapture";

installGlobalErrorCapture();

// After a new deploy, old hashed chunk files disappear. If an open tab tries to
// lazy-load one, reload once to pick up the fresh build instead of a blank screen.
const CHUNK_RELOAD_KEY = "pm_chunk_reload_at";
window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return; // avoid reload loops
  event.preventDefault();
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
