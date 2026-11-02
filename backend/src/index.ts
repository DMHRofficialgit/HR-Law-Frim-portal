import { createApp } from "./app";
import { env } from "./config/env";
import { ensureSystemCaseCategories } from "./lib/caseCategories";

const app = createApp();

ensureSystemCaseCategories()
  .catch((err) => {
    console.error("Failed to ensure case categories", err);
  })
  .finally(() => {
    app.listen(env.PORT, () => {
      console.log(`DM.HR API listening on http://localhost:${env.PORT}`);
    });
  });
