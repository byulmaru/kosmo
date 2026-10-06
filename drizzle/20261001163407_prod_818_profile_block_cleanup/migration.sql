UPDATE "profile_block_activity" AS activity
SET "closed_at" = CASE
  WHEN activity."state" = 'CLOSING'
    AND EXISTS (
      SELECT 1
      FROM "profile_block" AS product
      WHERE product."id" = activity."profile_block_id"
    )
  THEN NULL
  ELSE COALESCE(activity."closed_at", now())
END
WHERE activity."state" IN ('CLOSING', 'CLOSED');--> statement-breakpoint
DROP INDEX "profile_block_activity_owner_profile_id_target_profile_id_state_index";--> statement-breakpoint
ALTER TABLE "profile_block_activity" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "profile_block_activity" DROP COLUMN "delivery_state";--> statement-breakpoint
ALTER TABLE "profile_block_activity" DROP COLUMN "undo_delivery_state";--> statement-breakpoint
DROP TYPE "profile_block_activity_state";--> statement-breakpoint
DROP TYPE "profile_block_delivery_state";
