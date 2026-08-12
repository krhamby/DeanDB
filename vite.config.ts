import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served from the deandb.app root (Cloudflare Worker static assets), so the
// base is always "/". In dev, /api/* proxies to the local deandb-api server
// (run `npm run dev` inside api/) so the MusicBrainz proxy works offline
// from Cloudflare.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
