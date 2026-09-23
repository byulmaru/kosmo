CREATE TABLE "profile_pin" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"profile_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	CONSTRAINT "profile_pin_profile_id_post_id_unique" UNIQUE("profile_id","post_id")
);
--> statement-breakpoint
CREATE INDEX "profile_pin_profile_id_id_index" ON "profile_pin" ("profile_id","id");--> statement-breakpoint
ALTER TABLE "profile_pin" ADD CONSTRAINT "profile_pin_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_pin" ADD CONSTRAINT "profile_pin_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;
