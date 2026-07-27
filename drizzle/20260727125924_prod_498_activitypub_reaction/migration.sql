CREATE TABLE "activitypub_reaction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"uri" text NOT NULL UNIQUE,
	"reaction_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
ALTER TABLE "activitypub_reaction" ADD CONSTRAINT "activitypub_reaction_reaction_id_reaction_id_fkey" FOREIGN KEY ("reaction_id") REFERENCES "reaction"("id") ON DELETE CASCADE;