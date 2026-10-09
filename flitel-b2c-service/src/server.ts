import { serve } from "@hono/node-server";
import app from "./index.js";
import { closeDatabase } from "./mongodb.js";

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () => {
  console.log(`Flitel B2C API is running at http://127.0.0.1:${port}`);
});

process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
server.on("close", () => {
  closeDatabase().catch(() => {
    process.exitCode = 1;
  });
});
