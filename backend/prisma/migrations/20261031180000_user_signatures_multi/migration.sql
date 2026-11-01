-- Multi profile signatures (max 5 enforced in app)
CREATE TABLE "user_signatures" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_signatures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_signatures_user_id_idx" ON "user_signatures"("user_id");

ALTER TABLE "user_signatures" ADD CONSTRAINT "user_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate legacy single signature_png_path into user_signatures
INSERT INTO "user_signatures" ("id", "user_id", "storage_path", "is_default", "created_at")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", "signature_png_path", true, CURRENT_TIMESTAMP
FROM "users"
WHERE "signature_png_path" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_signatures" us WHERE us."user_id" = "users"."id"
  );
