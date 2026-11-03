CREATE TABLE "post_content_hashtag" (
	"post_content_id" uuid,
	"hashtag_id" uuid,
	CONSTRAINT "post_content_hashtag_pkey" PRIMARY KEY("post_content_id","hashtag_id")
);
--> statement-breakpoint
ALTER TABLE "post_content_hashtag" ADD CONSTRAINT "post_content_hashtag_post_content_id_post_content_id_fkey" FOREIGN KEY ("post_content_id") REFERENCES "post_content"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post_content_hashtag" ADD CONSTRAINT "post_content_hashtag_hashtag_id_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtag"("id") ON DELETE CASCADE;