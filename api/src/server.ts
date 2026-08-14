import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = createApp({ edgeKey: process.env.EDGE_SHARED_SECRET ?? "" });
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`deandb-api listening on :${port}`);
