-- Per-user email notification preferences (Phase B Settings)
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_cases" BOOLEAN NOT NULL DEFAULT true,
    "email_documents" BOOLEAN NOT NULL DEFAULT true,
    "email_signatures" BOOLEAN NOT NULL DEFAULT true,
    "email_onboarding" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
