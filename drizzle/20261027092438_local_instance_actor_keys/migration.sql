ALTER TABLE "instance" ADD COLUMN "activitypub_public_key_jwk" jsonb;--> statement-breakpoint
ALTER TABLE "instance" ADD COLUMN "activitypub_private_key_jwk" jsonb;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_activitypub_key_pair_null_together" CHECK (("activitypub_public_key_jwk" IS NULL) = ("activitypub_private_key_jwk" IS NULL));