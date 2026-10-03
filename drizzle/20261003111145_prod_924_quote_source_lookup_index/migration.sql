CREATE INDEX "post_repost_source_id_index" ON "post" USING btree ("repost_source_id") WHERE "repost_source_id" IS NOT NULL;
