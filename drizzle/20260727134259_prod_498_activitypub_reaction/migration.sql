CREATE TABLE "activitypub_reaction" (
	"uri" text NOT NULL UNIQUE,
	"reaction_id" uuid PRIMARY KEY
);
--> statement-breakpoint
ALTER TABLE "activitypub_reaction" ADD CONSTRAINT "activitypub_reaction_reaction_id_reaction_id_fkey" FOREIGN KEY ("reaction_id") REFERENCES "reaction"("id") ON DELETE CASCADE;