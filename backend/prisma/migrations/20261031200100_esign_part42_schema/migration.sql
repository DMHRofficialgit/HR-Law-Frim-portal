-- Part 4.2: assignee, value text, CC recipients
CREATE TABLE "signature_request_ccs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_request_ccs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signature_request_ccs_request_id_user_id_key" ON "signature_request_ccs"("request_id", "user_id");
CREATE INDEX "signature_request_ccs_request_id_idx" ON "signature_request_ccs"("request_id");
CREATE INDEX "signature_request_ccs_user_id_idx" ON "signature_request_ccs"("user_id");

ALTER TABLE "signature_request_ccs" ADD CONSTRAINT "signature_request_ccs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "signature_request_ccs" ADD CONSTRAINT "signature_request_ccs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_fields" ADD COLUMN "assignee_user_id" TEXT;
ALTER TABLE "signature_fields" ADD COLUMN "signed_by_user_id" TEXT;
ALTER TABLE "signature_fields" ADD COLUMN "value_text" TEXT;

CREATE INDEX "signature_fields_assignee_user_id_idx" ON "signature_fields"("assignee_user_id");

ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "signature_fields" ADD CONSTRAINT "signature_fields_signed_by_user_id_fkey" FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: assign existing fields to first active client user of the request org
UPDATE "signature_fields" sf
SET "assignee_user_id" = sub.user_id
FROM (
  SELECT sr.id AS request_id, u.id AS user_id
  FROM "signature_requests" sr
  INNER JOIN LATERAL (
    SELECT id FROM "users"
    WHERE "organisation_id" = sr."organisation_id"
      AND "role" = 'client'
      AND "status" = 'active'
    ORDER BY "created_at" ASC
    LIMIT 1
  ) u ON true
) sub
WHERE sf."request_id" = sub.request_id
  AND sf."assignee_user_id" IS NULL;
