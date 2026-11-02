-- CreateEnum
CREATE TYPE "FirmLibraryJourneyRole" AS ENUM ('terms', 'welcome', 'compliance', 'other');

-- AlterTable: Firm Library templates
ALTER TABLE "firm_library_documents"
ADD COLUMN "journey_role" "FirmLibraryJourneyRole" NOT NULL DEFAULT 'other';

-- AlterTable: Pack item snapshot
ALTER TABLE "onboarding_pack_items"
ADD COLUMN "journey_role" "FirmLibraryJourneyRole" NOT NULL DEFAULT 'other';

-- Optional backfill from legacy title heuristics (library + existing pack items)
UPDATE "firm_library_documents"
SET "journey_role" = 'terms'
WHERE "journey_role" = 'other' AND "title" ~* 'terms';

UPDATE "firm_library_documents"
SET "journey_role" = 'welcome'
WHERE "journey_role" = 'other' AND "title" ~* 'welcome';

UPDATE "firm_library_documents"
SET "journey_role" = 'compliance'
WHERE "journey_role" = 'other'
  AND "title" ~* 'compliance|gap analysis|data protection|hr support';

UPDATE "onboarding_pack_items"
SET "journey_role" = 'terms'
WHERE "journey_role" = 'other' AND "title" ~* 'terms';

UPDATE "onboarding_pack_items"
SET "journey_role" = 'welcome'
WHERE "journey_role" = 'other' AND "title" ~* 'welcome';

UPDATE "onboarding_pack_items"
SET "journey_role" = 'compliance'
WHERE "journey_role" = 'other'
  AND "title" ~* 'compliance|gap analysis|data protection|hr support';

-- Copy role from linked library template when pack still other
UPDATE "onboarding_pack_items" AS p
SET "journey_role" = d."journey_role"
FROM "firm_library_documents" AS d
WHERE p."library_document_id" = d."id"
  AND p."journey_role" = 'other'
  AND d."journey_role" <> 'other';

CREATE INDEX "firm_library_documents_journey_role_idx" ON "firm_library_documents"("journey_role");
CREATE INDEX "onboarding_pack_items_journey_role_idx" ON "onboarding_pack_items"("journey_role");
