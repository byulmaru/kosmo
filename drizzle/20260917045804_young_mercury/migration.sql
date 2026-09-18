CREATE TYPE "activitypub_quote_format" AS ENUM('FEP_044F', 'LEGACY');--> statement-breakpoint
CREATE TYPE "activitypub_quote_status" AS ENUM('PENDING', 'APPROVED', 'REVOKED', 'INVALID');--> statement-breakpoint
CREATE TABLE "activitypub_post_quote" (
	"post_id" uuid PRIMARY KEY,
	"target_uri" text NOT NULL,
	"format" "activitypub_quote_format" NOT NULL,
	"status" "activitypub_quote_status" NOT NULL,
	"approval_uri" text,
	"resolution_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activitypub_post_quote_target_uri_index" ON "activitypub_post_quote" ("target_uri");--> statement-breakpoint
CREATE INDEX "activitypub_post_quote_status_index" ON "activitypub_post_quote" ("status");--> statement-breakpoint
ALTER TABLE "activitypub_post_quote" ADD CONSTRAINT "activitypub_post_quote_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;