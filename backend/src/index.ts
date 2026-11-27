import { createApp } from "./app";
import { env } from "./config/env";
import { ensureSystemCaseCategories } from "./lib/caseCategories";
import { ensureEmailTemplatesSeeded } from "./lib/emailTemplates";
import { purgeExpiredArchives } from "./services/archive-purge";
import { purgeExpiredAuditEvents } from "./services/audit-purge";

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

/** Daily soft-archive purge (orgs / employees / cases older than 30 days). */
const DAY_MS = 24 * 60 * 60 * 1000;
const runArchivePurge = () => {
  purgeExpiredArchives()
    .then((r) => {
      const total =
        r.organisations.purged + r.employees.purged + r.cases.purged;
      if (total > 0) {
        console.log("Archive purge:", JSON.stringify(r));
      }
    })
    .catch((err) => console.error("Archive purge failed", err));
};
setTimeout(runArchivePurge, 60_000);
setInterval(runArchivePurge, DAY_MS);

const runAuditRetention = () => {
  purgeExpiredAuditEvents()
    .then((r) => {
      if (r.deleted > 0) {
        console.log("Audit retention purge:", JSON.stringify(r));
      }
    })
    .catch((err) => console.error("Audit retention purge failed", err));
};
setTimeout(runAuditRetention, 120_000);
setInterval(runAuditRetention, DAY_MS);
