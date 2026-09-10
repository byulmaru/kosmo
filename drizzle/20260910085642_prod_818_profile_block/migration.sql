CREATE TYPE "profile_block_activity_origin" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "profile_block_activity_state" AS ENUM('ACTIVE', 'CLOSING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "profile_block_delivery_state" AS ENUM('NONE', 'PENDING', 'SETTLED');--> statement-breakpoint
CREATE TABLE "profile_block_activity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"activity_uri" text NOT NULL UNIQUE,
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"actor_uri" text NOT NULL,
	"object_uri" text NOT NULL,
	"origin" "profile_block_activity_origin" NOT NULL,
	"state" "profile_block_activity_state" DEFAULT 'ACTIVE'::"profile_block_activity_state" NOT NULL,
	"delivery_state" "profile_block_delivery_state" DEFAULT 'NONE'::"profile_block_delivery_state" NOT NULL,
	"undo_delivery_state" "profile_block_delivery_state" DEFAULT 'NONE'::"profile_block_delivery_state" NOT NULL,
	"profile_block_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "profile_block_activity_owner_not_target" CHECK ("owner_profile_id" <> "target_profile_id")
);
--> statement-breakpoint
CREATE INDEX "profile_block_activity_owner_profile_id_target_profile_id_state_index" ON "profile_block_activity" ("owner_profile_id","target_profile_id","state");--> statement-breakpoint
CREATE INDEX "profile_block_activity_profile_block_id_index" ON "profile_block_activity" ("profile_block_id");--> statement-breakpoint
ALTER TABLE "profile_block_activity" ADD CONSTRAINT "profile_block_activity_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_block_activity" ADD CONSTRAINT "profile_block_activity_target_profile_id_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;