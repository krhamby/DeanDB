import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// On GitHub Pages the site is served from https://<user>.github.io/deandb/
// so we need the base path to match the repo name in production builds.
// Locally (dev/preview) we serve from root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/deandb/" : "/",
  plugins: [react(), tailwindcss()],
}));
