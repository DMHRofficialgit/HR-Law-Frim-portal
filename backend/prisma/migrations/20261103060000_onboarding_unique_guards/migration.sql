-- Keep newest in_progress run when duplicates exist
UPDATE "onboarding_runs" AS r
SET "status" = 'completed',
    "completed_at" = COALESCE(r."completed_at", CURRENT_TIMESTAMP)
FROM (
  SELECT "id",
    ROW_NUMBER() OVER (PARTITION BY "organisation_id" ORDER BY "started_at" DESC) AS rn
  FROM "onboarding_runs"
  WHERE "status" = 'in_progress'
) d
WHERE r."id" = d."id" AND d.rn > 1;

-- Drop duplicate pack rows (same run + library template), keep oldest
DELETE FROM "onboarding_pack_items" a
USING "onboarding_pack_items" b
WHERE a."library_document_id" IS NOT NULL
  AND a."id" <> b."id"
  AND a."run_id" = b."run_id"
  AND a."library_document_id" = b."library_document_id"
  AND a."created_at" > b."created_at";

-- One active onboarding run per organisation
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_runs_one_in_progress_per_org"
ON "onboarding_runs" ("organisation_id")
WHERE "status" = 'in_progress';

-- Prevent duplicate library templates on the same run
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_pack_items_run_id_library_document_id_key"
ON "onboarding_pack_items" ("run_id", "library_document_id");
