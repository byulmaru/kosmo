ALTER TABLE "profile" ADD COLUMN "default_post_visibility" "post_visibility";--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_default_post_visibility_check" CHECK (
        "default_post_visibility" IN ('PUBLIC', 'UNLISTED', 'FOLLOWERS')
        OR "default_post_visibility" IS NULL
      );