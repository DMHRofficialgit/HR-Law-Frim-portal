-- Align uploads with e-sign: PDF only (remove Word types).
UPDATE "upload_settings"
SET
  "allowed_extensions" = ARRAY['pdf']::text[],
  "allowed_mime_types" = ARRAY['application/pdf']::text[]
WHERE "id" = 'default';
