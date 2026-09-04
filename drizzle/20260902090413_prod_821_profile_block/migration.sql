CREATE TABLE "profile_block" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_block_owner_profile_id_target_profile_id_unique" UNIQUE("owner_profile_id","target_profile_id"),
	CONSTRAINT "profile_block_owner_not_target" CHECK ("owner_profile_id" <> "target_profile_id")
);
--> statement-breakpoint
CREATE INDEX "profile_block_target_profile_id_index" ON "profile_block" ("target_profile_id");--> statement-breakpoint
ALTER TABLE "profile_block" ADD CONSTRAINT "profile_block_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_block" ADD CONSTRAINT "profile_block_target_profile_id_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;