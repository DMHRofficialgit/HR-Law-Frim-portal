-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('sent', 'awaiting_signature', 'signed_returned', 'reviewed');

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'awaiting_signature',
    "source_document_id" TEXT,
    "source_file_name" TEXT NOT NULL,
    "source_mime_type" TEXT NOT NULL,
    "source_storage_path" TEXT NOT NULL,
    "source_size_bytes" INTEGER NOT NULL,
    "signed_storage_path" TEXT,
    "signature_image_path" TEXT,
    "audit_storage_path" TEXT,
    "typed_name" TEXT,
    "agreed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "signer_ip" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "signed_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_requests_organisation_id_idx" ON "signature_requests"("organisation_id");

-- CreateIndex
CREATE INDEX "signature_requests_status_idx" ON "signature_requests"("status");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_signed_by_id_fkey" FOREIGN KEY ("signed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
