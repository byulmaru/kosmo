CREATE TYPE "activitypub_object_type" AS ENUM('NOTE');--> statement-breakpoint
CREATE TABLE "activitypub_object" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"uri" text NOT NULL UNIQUE,
	"type" "activitypub_object_type" NOT NULL,
	"activitypub_actor_id" uuid NOT NULL,
	"post_id" uuid NOT NULL UNIQUE,
	"received_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "activitypub_object_activitypub_actor_id_index" ON "activitypub_object" ("activitypub_actor_id");--> statement-breakpoint
ALTER TABLE "activitypub_object" ADD CONSTRAINT "activitypub_object_MeYXpX8ODCSm_fkey" FOREIGN KEY ("activitypub_actor_id") REFERENCES "activitypub_actor"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "activitypub_object" ADD CONSTRAINT "activitypub_object_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;