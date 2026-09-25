ALTER TYPE "profile_block_activity_state" ADD VALUE 'CLOSING' BEFORE 'CLOSED';--> statement-breakpoint
ALTER TYPE "profile_block_delivery_state" ADD VALUE 'PENDING' BEFORE 'SETTLED';--> statement-breakpoint
DROP INDEX "profile_block_activity_active_pair_unique";--> statement-breakpoint
CREATE INDEX "profile_block_activity_owner_profile_id_target_profile_id_state_index" ON "profile_block_activity" ("owner_profile_id","target_profile_id","state");
