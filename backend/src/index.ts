import { createApp } from "./app";
import { env } from "./config/env";
import { ensureSystemCaseCategories } from "./lib/caseCategories";
import { ensureEmailTemplatesSeeded } from "./lib/emailTemplates";

const app = createApp();

process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

// Bind immediately so Render health checks succeed during seed work.
const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`DM.HR API listening on http://0.0.0.0:${env.PORT}`);
});

// Render's edge reuses connections longer than Node's default keep-alive (~5s).
// After Free → always-on Starter, that mismatch causes intermittent 502s / "connection closed".
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

Promise.all([ensureSystemCaseCategories(), ensureEmailTemplatesSeeded()]).catch((err) => {
  console.error("Failed to ensure system seed data", err);
});
