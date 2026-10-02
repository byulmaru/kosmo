ALTER TABLE "profile_pinned_post" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD CONSTRAINT "profile_pinned_post_profile_id_position_unique" UNIQUE("profile_id","position");--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD CONSTRAINT "profile_pinned_post_position_nonnegative" CHECK ("position" IS NULL OR "position" >= 0);
