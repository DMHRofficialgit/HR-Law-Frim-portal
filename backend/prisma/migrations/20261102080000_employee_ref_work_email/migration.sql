-- AlterTable
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "ref" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_email" TEXT;

-- Backfill refs for existing rows (per organisation, EMP-0001+)
WITH numbered AS (
  SELECT
    id,
    organisation_id,
    ROW_NUMBER() OVER (PARTITION BY organisation_id ORDER BY created_at ASC, id ASC) AS rn
  FROM "employees"
  WHERE "ref" IS NULL OR TRIM("ref") = ''
)
UPDATE "employees" e
SET "ref" = 'EMP-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE e.id = numbered.id;

-- Unique ref per organisation (nulls allowed; Postgres treats nulls as distinct)
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organisation_id_ref_key"
  ON "employees"("organisation_id", "ref");
