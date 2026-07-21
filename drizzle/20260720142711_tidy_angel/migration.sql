CREATE TABLE "bookmark" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"profile_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmark_profile_id_post_id_unique" UNIQUE("profile_id","post_id")
);
--> statement-breakpoint
CREATE INDEX "bookmark_profile_id_id_index" ON "bookmark" ("profile_id","id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bookmark" ADD CONSTRAINT "bookmark_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;