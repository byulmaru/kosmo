CREATE TABLE "profile_mute" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "profile_mute_owner_profile_id_target_profile_id_unique" UNIQUE("owner_profile_id","target_profile_id")
);
--> statement-breakpoint
CREATE INDEX "profile_mute_owner_profile_id_id_index" ON "profile_mute" ("owner_profile_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profile_mute_target_profile_id_index" ON "profile_mute" ("target_profile_id");--> statement-breakpoint
ALTER TABLE "profile_mute" ADD CONSTRAINT "profile_mute_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_mute" ADD CONSTRAINT "profile_mute_target_profile_id_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;
