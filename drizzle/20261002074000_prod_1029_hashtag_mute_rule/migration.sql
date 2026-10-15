CREATE TYPE "hashtag_mute_decision" AS ENUM('EXCLUDE', 'COLLAPSE');
--> statement-breakpoint
CREATE TYPE "hashtag_mute_scope" AS ENUM('HOME', 'LOCAL', 'PROFILE', 'HASHTAG', 'SEARCH', 'NOTIFICATION');
--> statement-breakpoint
CREATE TABLE "hashtag_mute_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"owner_profile_id" uuid NOT NULL,
	"target_hashtag_id" uuid NOT NULL,
	"scopes" "hashtag_mute_scope"[] NOT NULL,
	"decision" "hashtag_mute_decision" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtag_mute_rule_owner_profile_id_target_hashtag_id_unique" UNIQUE("owner_profile_id","target_hashtag_id"),
	CONSTRAINT "hashtag_mute_rule_scopes_nonempty" CHECK (cardinality("scopes") > 0),
	CONSTRAINT "hashtag_mute_rule_scopes_no_null" CHECK (array_position("scopes", NULL) IS NULL)
);

--> statement-breakpoint
CREATE INDEX "hashtag_mute_rule_owner_profile_id_id_index" ON "hashtag_mute_rule" ("owner_profile_id","id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "hashtag_mute_rule_target_hashtag_id_index" ON "hashtag_mute_rule" ("target_hashtag_id");
--> statement-breakpoint
ALTER TABLE "hashtag_mute_rule" ADD CONSTRAINT "hashtag_mute_rule_owner_profile_id_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "hashtag_mute_rule" ADD CONSTRAINT "hashtag_mute_rule_target_hashtag_id_hashtag_id_fkey" FOREIGN KEY ("target_hashtag_id") REFERENCES "hashtag"("id") ON DELETE CASCADE;
