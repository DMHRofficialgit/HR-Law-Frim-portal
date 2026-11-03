-- AlterTable: key enum → text, add is_system
ALTER TABLE "firm_staging_folders" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "firm_staging_folders" ALTER COLUMN "key" TYPE TEXT USING ("key"::text);

DROP TYPE "FirmStagingFolderKey";

UPDATE "firm_staging_folders"
SET "is_system" = true
WHERE "key" IN (
  'my_documents',
  'my_policies',
  'my_handbook',
  'my_contracts',
  'my_useful_documents',
  'my_private_space'
);

CREATE INDEX "firm_staging_folders_is_system_idx" ON "firm_staging_folders"("is_system");
