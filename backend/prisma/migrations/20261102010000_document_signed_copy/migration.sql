-- AlterTable
ALTER TABLE "documents" ADD COLUMN "is_signed_copy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN "signature_request_id" TEXT;

-- CreateIndex
CREATE INDEX "documents_signature_request_id_idx" ON "documents"("signature_request_id");
CREATE INDEX "documents_is_signed_copy_idx" ON "documents"("is_signed_copy");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_signature_request_id_fkey" FOREIGN KEY ("signature_request_id") REFERENCES "signature_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing published signed copies (title patterns from e-sign publish + filename sanitize)
UPDATE "documents"
SET "is_signed_copy" = true
WHERE "is_signed_copy" = false
  AND (
    "title" LIKE '% — Signed — %'
    OR "title" LIKE '% _ Signed _ %'
    OR "title" LIKE '% - Signed - %'
  );
