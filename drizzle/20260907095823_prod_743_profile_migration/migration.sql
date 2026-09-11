CREATE TABLE "profile_migration" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"target_profile_id" uuid NOT NULL UNIQUE,
	"source_profile_id" uuid NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_migration" ADD CONSTRAINT "profile_migration_target_profile_id_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_migration" ADD CONSTRAINT "profile_migration_source_profile_id_profile_id_fkey" FOREIGN KEY ("source_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;