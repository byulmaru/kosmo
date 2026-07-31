CREATE TYPE "profile_media_kind" AS ENUM('AVATAR', 'HEADER');--> statement-breakpoint
CREATE TABLE "profile_media" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"profile_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "profile_media_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_media_profile_id_kind_unique" UNIQUE("profile_id","kind")
);
--> statement-breakpoint
CREATE INDEX "profile_media_media_id_index" ON "profile_media" ("media_id");--> statement-breakpoint
ALTER TABLE "profile_media" ADD CONSTRAINT "profile_media_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_media" ADD CONSTRAINT "profile_media_media_id_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE;