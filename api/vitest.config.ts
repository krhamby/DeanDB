import { defineConfig } from "vitest/config";

// Pin vitest to this package — without a local config, vitest walks up and
// loads the SPA's root vite.config.ts (react/tailwind plugins the api
// doesn't depend on), which breaks isolated checkouts of api/.
export default defineConfig({
  test: { root: import.meta.dirname },
});
