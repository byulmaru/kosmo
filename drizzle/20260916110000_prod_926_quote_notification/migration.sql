ALTER TYPE "notification_kind" ADD VALUE 'QUOTE' BEFORE 'REACTION';--> statement-breakpoint
CREATE TABLE "notification_rollout" (
	"key" text PRIMARY KEY NOT NULL,
	"activated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE TABLE "notification_quote_judgment" (
	"quote_post_id" uuid NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"representative_kind" text,
	"representative_notification_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_quote_judgment_pkey" PRIMARY KEY("quote_post_id","recipient_profile_id"),
	CONSTRAINT "notification_quote_judgment_outcome_check" CHECK ("outcome" IN ('EMITTED', 'SUPPRESSED', 'REPRESENTED_BY_EXISTING', 'EXCLUDED_PRELAUNCH'))
);--> statement-breakpoint
CREATE INDEX "notification_quote_judgment_recipient_profile_id_quote_post_id_index" ON "notification_quote_judgment" ("recipient_profile_id","quote_post_id");--> statement-breakpoint
ALTER TABLE "notification_quote_judgment" ADD CONSTRAINT "notification_quote_judgment_quote_post_id_post_id_fkey" FOREIGN KEY ("quote_post_id") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_quote_judgment" ADD CONSTRAINT "notification_quote_judgment_Pmd8PxLJM9hf_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "notification_rollout" ("key", "activated_at") VALUES ('QUOTE_NOTIFICATION', now()) ON CONFLICT ("key") DO NOTHING;
