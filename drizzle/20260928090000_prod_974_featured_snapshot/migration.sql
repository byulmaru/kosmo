ALTER TABLE "activitypub_actor" ADD COLUMN "featured_uri" text;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD COLUMN "featured_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD CONSTRAINT "activitypub_actor_featured_revision_nonnegative" CHECK ("featured_revision" >= 0);--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD CONSTRAINT "profile_pinned_post_profile_id_position_unique" UNIQUE("profile_id","position");--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD CONSTRAINT "profile_pinned_post_position_nonnegative" CHECK ("position" IS NULL OR "position" >= 0);
