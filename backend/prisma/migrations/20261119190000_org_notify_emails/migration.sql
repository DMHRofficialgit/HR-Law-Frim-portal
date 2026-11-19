-- Org-level CC emails for client-facing alerts (no portal login)
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "notify_emails" TEXT;
