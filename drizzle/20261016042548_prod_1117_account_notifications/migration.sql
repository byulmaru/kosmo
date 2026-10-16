CREATE TABLE "notification_recipient_snapshot" (
	"kind" "notification_kind",
	"source_id" uuid,
	"actor_account_id" uuid,
	"recipients" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_recipient_snapshot_pkey" PRIMARY KEY("kind","source_id")
);
--> statement-breakpoint
DO $$
DECLARE
	orphan_notification_count bigint;
BEGIN
	SELECT count(*) INTO orphan_notification_count
	FROM "notification" AS notification
	WHERE notification."recipient_profile_id" IS NOT NULL
	  AND NOT EXISTS (
		SELECT 1
		FROM "account_profile" AS account_profile
		WHERE account_profile."profile_id" = notification."recipient_profile_id"
	  );

	IF orphan_notification_count > 0 THEN
		RAISE EXCEPTION
			'Cannot migrate profile notifications: found % notification(s) whose target profile has no linked account. Add an account_profile membership or resolve the notification before retrying.',
			orphan_notification_count;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_profile_id_kind_source_id_unique";--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_account_id_kind_source_id_unique";--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_check";--> statement-breakpoint
WITH ranked_recipients AS (
	SELECT
		notification."id",
		account_profile."account_id",
		row_number() OVER (
			PARTITION BY notification."id"
			ORDER BY (account_profile."role" = 'OWNER') DESC, account_profile."account_id" ASC
		) AS recipient_rank
	FROM "notification" AS notification
	INNER JOIN "account_profile" AS account_profile
		ON account_profile."profile_id" = notification."recipient_profile_id"
	WHERE notification."recipient_profile_id" IS NOT NULL
)
UPDATE "notification" AS notification
SET "recipient_account_id" = ranked_recipients."account_id"
FROM ranked_recipients
WHERE notification."id" = ranked_recipients."id"
	AND ranked_recipients.recipient_rank = 1;--> statement-breakpoint
INSERT INTO "notification" (
	"id",
	"recipient_profile_id",
	"recipient_account_id",
	"kind",
	"source_id",
	"data",
	"created_at",
	"read_at"
)
SELECT
	uuidv7(),
	notification."recipient_profile_id",
	account_profile."account_id",
	notification."kind",
	notification."source_id",
	notification."data",
	notification."created_at",
	notification."read_at"
FROM "notification" AS notification
INNER JOIN "account_profile" AS account_profile
	ON account_profile."profile_id" = notification."recipient_profile_id"
WHERE notification."recipient_profile_id" IS NOT NULL
	AND account_profile."account_id" <> notification."recipient_account_id"
ORDER BY notification."id", account_profile."account_id";--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "recipient_account_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "notification_recipient_profile_id_id_index";--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_account_id_recipient_profile_id_kind_source_id_index" ON "notification" ("recipient_account_id","recipient_profile_id","kind","source_id") WHERE "recipient_profile_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_account_id_kind_source_id_index" ON "notification" ("recipient_account_id","kind","source_id") WHERE "recipient_profile_id" IS NULL;--> statement-breakpoint
CREATE INDEX "notification_recipient_profile_id_created_at_id_index" ON "notification" ("recipient_profile_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_recipient_account_id_created_at_id_index" ON "notification" ("recipient_account_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "notification_recipient_snapshot" ADD CONSTRAINT "notification_recipient_snapshot_ffEW8RmYWXv4_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL;
