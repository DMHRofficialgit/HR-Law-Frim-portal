-- AlterTable
ALTER TABLE "invite_tokens" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'invite';

-- Backfill any legacy rows (default already covers new column)
UPDATE "invite_tokens" SET "purpose" = 'invite' WHERE "purpose" IS NULL OR "purpose" = '';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invite_tokens_user_id_purpose_used_at_idx" ON "invite_tokens"("user_id", "purpose", "used_at");
