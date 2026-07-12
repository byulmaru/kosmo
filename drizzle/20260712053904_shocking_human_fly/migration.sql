ALTER TABLE "profile" ADD COLUMN "followers_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "following_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "profile"
SET "followers_count" = (
	SELECT count(*)
	FROM "profile_follow"
	WHERE "profile_follow"."followee_profile_id" = "profile"."id"
);--> statement-breakpoint
UPDATE "profile"
SET "following_count" = (
	SELECT count(*)
	FROM "profile_follow"
	WHERE "profile_follow"."follower_profile_id" = "profile"."id"
);
