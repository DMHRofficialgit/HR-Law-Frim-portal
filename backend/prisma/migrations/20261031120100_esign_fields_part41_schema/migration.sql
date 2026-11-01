-- Part 4.1 step 2: schema after enum values are committed

DO $$ BEGIN
  CREATE TYPE "SignatureFieldType" AS ENUM ('signature');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "signature_requests" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "signature_requests" ALTER COLUMN "sent_at" DROP NOT NULL;
ALTER TABLE "signature_requests" ALTER COLUMN "sent_at" DROP DEFAULT;
ALTER TABLE "signature_requests" ADD COLUMN IF NOT EXISTS "revision_note" TEXT;

CREATE TABLE IF NOT EXISTS "signature_fields" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "type" "SignatureFieldType" NOT NULL DEFAULT 'signature',
    "page" INTEGER NOT NULL DEFAULT 1,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Signature',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "signed_image_path" TEXT,
    "signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_fields_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "signature_fields_request_id_idx" ON "signature_fields"("request_id");
CREATE INDEX IF NOT EXISTS "signature_requests_source_document_id_idx" ON "signature_requests"("source_document_id");

DO $$ BEGIN
  ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
