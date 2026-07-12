ALTER TABLE "post_content" RENAME COLUMN "spoiler_text" TO "content_warning";--> statement-breakpoint
ALTER TABLE "post_content" DROP COLUMN "body_json";--> statement-breakpoint
ALTER TABLE "post_content" DROP COLUMN "body_html";
