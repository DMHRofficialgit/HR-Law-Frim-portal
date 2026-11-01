CREATE TYPE "OnboardingRunStatus" AS ENUM ('in_progress', 'completed');
CREATE TYPE "OnboardingPackItemStatus" AS ENUM ('issued', 'awaiting_signature', 'signed', 'reviewed', 'done');
CREATE TYPE "OnboardingPaymentKind" AS ENUM ('direct_debit', 'initial_payment');

CREATE TABLE "firm_library_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "requires_signature" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firm_library_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "firm_library_documents_sort_order_idx" ON "firm_library_documents"("sort_order");

CREATE TABLE "onboarding_runs" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "status" "OnboardingRunStatus" NOT NULL DEFAULT 'in_progress',
    "welcome_email_sent_at" TIMESTAMP(3),
    "welcome_email_subject" TEXT,
    "welcome_email_body" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_runs_organisation_id_idx" ON "onboarding_runs"("organisation_id");
CREATE INDEX "onboarding_runs_status_idx" ON "onboarding_runs"("status");

ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "onboarding_pack_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "library_document_id" TEXT,
    "client_document_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requires_signature" BOOLEAN NOT NULL DEFAULT true,
    "status" "OnboardingPackItemStatus" NOT NULL DEFAULT 'issued',
    "signature_request_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_pack_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_pack_items_run_id_idx" ON "onboarding_pack_items"("run_id");
CREATE INDEX "onboarding_pack_items_client_document_id_idx" ON "onboarding_pack_items"("client_document_id");
CREATE INDEX "onboarding_pack_items_signature_request_id_idx" ON "onboarding_pack_items"("signature_request_id");

ALTER TABLE "onboarding_pack_items" ADD CONSTRAINT "onboarding_pack_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "onboarding_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_pack_items" ADD CONSTRAINT "onboarding_pack_items_library_document_id_fkey" FOREIGN KEY ("library_document_id") REFERENCES "firm_library_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_pack_items" ADD CONSTRAINT "onboarding_pack_items_client_document_id_fkey" FOREIGN KEY ("client_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_pack_items" ADD CONSTRAINT "onboarding_pack_items_signature_request_id_fkey" FOREIGN KEY ("signature_request_id") REFERENCES "signature_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "onboarding_payment_links" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "kind" "OnboardingPaymentKind" NOT NULL,
    "url" TEXT NOT NULL,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_payment_links_run_id_kind_key" ON "onboarding_payment_links"("run_id", "kind");
CREATE INDEX "onboarding_payment_links_run_id_idx" ON "onboarding_payment_links"("run_id");

ALTER TABLE "onboarding_payment_links" ADD CONSTRAINT "onboarding_payment_links_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "onboarding_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "document_folders" ("id", "organisation_id", "key", "name", "sort_order", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text || o."id"), o."id", 'my_onboarding', 'My Onboarding', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organisations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "document_folders" f
  WHERE f."organisation_id" = o."id" AND f."key" = 'my_onboarding'
);
