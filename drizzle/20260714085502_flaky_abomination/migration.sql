UPDATE "post" SET "current_content_id" = NULL;--> statement-breakpoint
DELETE FROM "post_content";--> statement-breakpoint
DELETE FROM "post";--> statement-breakpoint
ALTER TABLE "post_content" ADD COLUMN "body_schema_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "post_content" ADD COLUMN "body_document" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_content" DROP COLUMN "body_text";
