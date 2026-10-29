ALTER TABLE "profile_pinned_post" ADD COLUMN "order_key" bytea;
--> statement-breakpoint
ALTER TABLE "profile_pinned_post" ADD CONSTRAINT "profile_pinned_post_profile_id_order_key_unique" UNIQUE("profile_id","order_key");
