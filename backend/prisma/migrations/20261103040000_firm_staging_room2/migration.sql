-- CreateEnum
CREATE TYPE "FirmStagingFolderKey" AS ENUM (
  'my_documents',
  'my_policies',
  'my_handbook',
  'my_contracts',
  'my_useful_documents',
  'my_private_space'
);

-- CreateTable
CREATE TABLE "firm_staging_folders" (
  "id" TEXT NOT NULL,
  "key" "FirmStagingFolderKey" NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "firm_staging_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firm_staging_files" (
  "id" TEXT NOT NULL,
  "folder_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "firm_staging_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firm_staging_folders_key_key" ON "firm_staging_folders"("key");

-- CreateIndex
CREATE INDEX "firm_staging_folders_sort_order_idx" ON "firm_staging_folders"("sort_order");

-- CreateIndex
CREATE INDEX "firm_staging_files_folder_id_idx" ON "firm_staging_files"("folder_id");

-- CreateIndex
CREATE INDEX "firm_staging_files_created_by_id_idx" ON "firm_staging_files"("created_by_id");

-- AddForeignKey
ALTER TABLE "firm_staging_files" ADD CONSTRAINT "firm_staging_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "firm_staging_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_staging_files" ADD CONSTRAINT "firm_staging_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
