UPDATE "post_mentions" AS "mention"
SET "post_id" = "post"."id"
FROM "post" AS "post"
WHERE "mention"."post_content_id" = "post"."current_content_id"
  AND "mention"."post_id" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "post_mentions" AS "marker"
    WHERE "marker"."post_id" = "post"."id"
      AND "marker"."profile_id" = "mention"."profile_id"
  );
