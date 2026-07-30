CREATE TABLE "hashtag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_hashtag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"profile_id" uuid NOT NULL,
	"hashtag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_hashtag_profile_id_hashtag_id_unique" UNIQUE("profile_id","hashtag_id")
);
--> statement-breakpoint
CREATE INDEX "profile_hashtag_hashtag_id_index" ON "profile_hashtag" ("hashtag_id");--> statement-breakpoint
ALTER TABLE "profile_hashtag" ADD CONSTRAINT "profile_hashtag_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_hashtag" ADD CONSTRAINT "profile_hashtag_hashtag_id_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtag"("id") ON DELETE CASCADE;
