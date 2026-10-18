-- kosmo:transaction off
CREATE UNIQUE INDEX CONCURRENTLY "notification_recipient_account_id_kind_source_id_index" ON "notification" ("recipient_account_id","kind","source_id") WHERE "recipient_profile_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "notification_account_profile_kind_source_unique" ON "notification" ("recipient_account_id","recipient_profile_id","kind","source_id") WHERE "recipient_profile_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "notification_recipient_profile_id_created_at_id_index" ON "notification" ("recipient_profile_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "notification_recipient_account_id_created_at_id_index" ON "notification" ("recipient_account_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
