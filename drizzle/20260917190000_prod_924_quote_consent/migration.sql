CREATE TYPE "post_quote_policy_value" AS ENUM('EVERYONE', 'FOLLOWERS', 'AUTHOR');--> statement-breakpoint
CREATE TYPE "post_quote_consent_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_policy" "post_quote_policy_value";--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_source_post_id" uuid;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_source_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_source_author_actor_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_quote_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_quote_author_actor_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_request_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_approval_uri" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_status" "post_quote_consent_status";--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_revision" integer;--> statement-breakpoint
UPDATE "post" SET "quote_policy" = 'EVERYONE'
FROM "profile", "instance"
WHERE "post"."profile_id" = "profile"."id"
  AND "profile"."instance_id" = "instance"."id"
  AND "instance"."kind" = 'LOCAL'
  AND "post"."state" = 'ACTIVE'
  AND "post"."current_content_id" IS NOT NULL
  AND "post"."quote_policy" IS NULL;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_quote_consent_source_post_id_post_id_fkey" FOREIGN KEY ("quote_consent_source_post_id") REFERENCES "public"."post"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_quote_consent_request_uri_key" UNIQUE("quote_consent_request_uri");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_quote_consent_approval_uri_key" UNIQUE("quote_consent_approval_uri");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_quote_consent_complete" CHECK (("quote_consent_status" IS NULL AND "quote_consent_source_post_id" IS NULL AND "quote_consent_source_uri" IS NULL AND "quote_consent_source_author_actor_uri" IS NULL AND "quote_consent_quote_uri" IS NULL AND "quote_consent_quote_author_actor_uri" IS NULL AND "quote_consent_request_uri" IS NULL AND "quote_consent_approval_uri" IS NULL AND "quote_consent_revision" IS NULL) OR ("quote_consent_status" IS NOT NULL AND "quote_consent_source_post_id" IS NOT NULL AND "quote_consent_source_uri" IS NOT NULL AND "quote_consent_source_author_actor_uri" IS NOT NULL AND "quote_consent_quote_uri" IS NOT NULL AND "quote_consent_quote_author_actor_uri" IS NOT NULL AND "quote_consent_request_uri" IS NOT NULL AND "quote_consent_revision" IS NOT NULL AND "quote_consent_revision" > 0));--> statement-breakpoint
CREATE INDEX "post_quote_consent_source_post_id_index" ON "post" USING btree ("quote_consent_source_post_id");--> statement-breakpoint
CREATE INDEX "post_quote_consent_binding_index" ON "post" USING btree ("quote_consent_status","quote_consent_source_author_actor_uri","quote_consent_source_uri","quote_consent_quote_uri");
