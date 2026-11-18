-- Shared mailbox for client case activity notifications (Dave: case@dmhrgroup.com)
ALTER TABLE "smtp_settings" ADD COLUMN IF NOT EXISTS "cases_notify_email" TEXT;

UPDATE "smtp_settings"
SET "cases_notify_email" = 'case@dmhrgroup.com'
WHERE "id" = 'default' AND ("cases_notify_email" IS NULL OR "cases_notify_email" = '');
