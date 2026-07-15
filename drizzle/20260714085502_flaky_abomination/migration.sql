UPDATE "post" SET "current_content_id" = NULL;--> statement-breakpoint
DELETE FROM "post_content";--> statement-breakpoint
DELETE FROM "post";--> statement-breakpoint
ALTER TABLE "post_content" ADD COLUMN "document" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_content" DROP COLUMN "body_text";--> statement-breakpoint
ALTER TABLE "post_content" DROP COLUMN "content_warning";
