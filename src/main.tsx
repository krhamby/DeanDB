import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./lib/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);

// Register the service worker for offline support + installability (PWA).
// Production only — a SW in dev would shadow Vite's HMR. BASE_URL-relative so it
// keeps working under /DeanDB/ today and a custom domain later.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const base = import.meta.env.BASE_URL;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* offline support is best-effort — ignore registration failures */
    });
  });
}
