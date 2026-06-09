import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// On GitHub Pages the site is served from https://<user>.github.io/DeanDB/
// so we need the base path to match the repo name — including its exact
// casing, since Pages URLs are case-sensitive — in production builds.
// `vite preview` resolves with command "serve", so key on isPreview too:
// it serves the /DeanDB/-based dist and must serve it at that same base
// (with base "/" every hashed asset URL fell through to the SPA fallback —
// a white screen). Only the dev server runs from root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/DeanDB/" : "/",
  plugins: [react(), tailwindcss()],
}));
