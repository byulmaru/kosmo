DROP INDEX "media_remote_url_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "media_remote_profile_url_unique" ON "media" ("profile_id","url") WHERE "source" = 'REMOTE';