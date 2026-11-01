-- CreateEnum
CREATE TYPE "FirmLibraryFieldRole" AS ENUM ('client', 'admin');

-- CreateTable
CREATE TABLE "firm_library_fields" (
    "id" TEXT NOT NULL,
    "library_document_id" TEXT NOT NULL,
    "type" "SignatureFieldType" NOT NULL DEFAULT 'signature',
    "page" INTEGER NOT NULL DEFAULT 1,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Signature',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "role" "FirmLibraryFieldRole" NOT NULL DEFAULT 'client',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firm_library_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "firm_library_fields_library_document_id_idx" ON "firm_library_fields"("library_document_id");

-- AddForeignKey
ALTER TABLE "firm_library_fields" ADD CONSTRAINT "firm_library_fields_library_document_id_fkey" FOREIGN KEY ("library_document_id") REFERENCES "firm_library_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
