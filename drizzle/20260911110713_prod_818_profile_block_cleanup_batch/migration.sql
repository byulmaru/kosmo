CREATE TABLE "profile_block_cleanup_batch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"operation" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"profile_block_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"protocol_activity_uri" text,
	"protocol_state" text,
	"changed" boolean NOT NULL,
	"effect_plan" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "profile_block_cleanup_batch_operation_operation_id_unique" UNIQUE("operation","operation_id"),
	CONSTRAINT "profile_block_cleanup_batch_operation_check" CHECK ("operation" IN ('BLOCK', 'UNBLOCK')),
	CONSTRAINT "profile_block_cleanup_batch_origin_check" CHECK ("origin" IN ('LOCAL', 'ACTIVITYPUB'))
);
--> statement-breakpoint
CREATE INDEX "profile_block_cleanup_batch_owner_profile_id_target_profile_id_settled_at_index" ON "profile_block_cleanup_batch" ("owner_profile_id","target_profile_id","settled_at");--> statement-breakpoint
ALTER TABLE "profile_block_cleanup_batch" ADD CONSTRAINT "profile_block_cleanup_batch_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_block_cleanup_batch" ADD CONSTRAINT "profile_block_cleanup_batch_target_profile_id_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;