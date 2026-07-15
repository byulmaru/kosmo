ALTER TABLE "profile_follow_request" ADD COLUMN "inbound_follow_activity_id" text;--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD COLUMN "inbound_follow_actor_uri" text;--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD COLUMN "inbound_follow_object_uri" text;--> statement-breakpoint
ALTER TABLE "profile_follow" ADD COLUMN "inbound_follow_activity_id" text;--> statement-breakpoint
ALTER TABLE "profile_follow" ADD COLUMN "inbound_follow_actor_uri" text;--> statement-breakpoint
ALTER TABLE "profile_follow" ADD COLUMN "inbound_follow_object_uri" text;
