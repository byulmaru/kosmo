CREATE TABLE "post_mentions" (
	"post_content_id" uuid,
	"profile_id" uuid,
	CONSTRAINT "post_mentions_pkey" PRIMARY KEY("post_content_id","profile_id")
);
--> statement-breakpoint
CREATE INDEX "post_mentions_profile_id_index" ON "post_mentions" ("profile_id");--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_content_id_post_content_id_fkey" FOREIGN KEY ("post_content_id") REFERENCES "post_content"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;