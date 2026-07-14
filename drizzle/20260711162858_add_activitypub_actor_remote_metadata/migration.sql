ALTER TYPE "activitypub_actor_type" ADD VALUE 'APPLICATION' BEFORE 'PERSON';--> statement-breakpoint
ALTER TYPE "activitypub_actor_type" ADD VALUE 'GROUP' BEFORE 'PERSON';--> statement-breakpoint
ALTER TYPE "activitypub_actor_type" ADD VALUE 'ORGANIZATION' BEFORE 'PERSON';--> statement-breakpoint
ALTER TYPE "activitypub_actor_type" ADD VALUE 'SERVICE';--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "inbox_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "outbox_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "followers_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "following_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "shared_inbox_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "last_fetched_at" timestamp with time zone;