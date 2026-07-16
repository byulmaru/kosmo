CREATE TABLE "activitypub_post" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"uri" text NOT NULL UNIQUE,
	"post_id" uuid NOT NULL UNIQUE,
	"received_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activitypub_post" ADD CONSTRAINT "activitypub_post_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;