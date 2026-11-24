CREATE TYPE "post_quote_policy_value" AS ENUM('EVERYONE', 'FOLLOWERS', 'AUTHOR');--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_policy" "post_quote_policy_value";--> statement-breakpoint
UPDATE "post" SET "quote_policy" = 'EVERYONE'
FROM "profile", "instance"
WHERE "post"."profile_id" = "profile"."id"
  AND "profile"."instance_id" = "instance"."id"
  AND "instance"."kind" = 'LOCAL'
  AND "post"."state" = 'ACTIVE'
  AND "post"."current_content_id" IS NOT NULL
  AND "post"."quote_policy" IS NULL;
