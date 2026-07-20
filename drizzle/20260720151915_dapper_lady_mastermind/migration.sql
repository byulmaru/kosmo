CREATE TABLE "reaction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"profile_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reaction_post_id_type_profile_id_unique" UNIQUE("post_id","type","profile_id")
);
--> statement-breakpoint
CREATE INDEX "reaction_profile_id_index" ON "reaction" ("profile_id");--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;