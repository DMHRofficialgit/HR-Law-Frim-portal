import { createApp } from "./app";
import { env } from "./config/env";
import { ensureSystemCaseCategories } from "./lib/caseCategories";
import { ensureEmailTemplatesSeeded } from "./lib/emailTemplates";

const app = createApp();

Promise.all([ensureSystemCaseCategories(), ensureEmailTemplatesSeeded()])
  .catch((err) => {
    console.error("Failed to ensure system seed data", err);
  })
  .finally(() => {
    app.listen(env.PORT, () => {
      console.log(`DM.HR API listening on http://localhost:${env.PORT}`);
    });
  });
