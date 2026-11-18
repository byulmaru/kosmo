CREATE TABLE "natural_language_mute_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"owner_profile_id" uuid NOT NULL,
	"condition" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "natural_language_mute_rule_owner_profile_id_index" ON "natural_language_mute_rule" ("owner_profile_id");--> statement-breakpoint
ALTER TABLE "natural_language_mute_rule" ADD CONSTRAINT "natural_language_mute_rule_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;