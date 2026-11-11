-- kosmo:transaction off
-- Recovery: committed slug batches are retained; rerunning fills only NULL slugs.
-- If the concurrent unique index is invalid, inspect pg_index and drop it with
-- DROP INDEX CONCURRENTLY before retrying. Do not delete valid populated slugs.
ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.generate_post_slug()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
  alphabet CONSTANT text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  slug text := '';
  uuid_bytes bytea;
  byte_index integer;
  random_byte integer;
BEGIN
  WHILE length(slug) < 12 LOOP
    uuid_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
    FOR byte_index IN 0..15 LOOP
      IF byte_index IN (6, 8) THEN
        CONTINUE;
      END IF;

      random_byte := pg_catalog.get_byte(uuid_bytes, byte_index);
      IF random_byte < 248 THEN
        slug := slug || pg_catalog.substr(alphabet, random_byte % 62 + 1, 1);
        EXIT WHEN length(slug) = 12;
      END IF;
    END LOOP;
  END LOOP;

  RETURN slug;
END
$function$;
--> statement-breakpoint
ALTER TABLE "post" ALTER COLUMN "slug" SET DEFAULT public.generate_post_slug();
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "post_slug_unique" ON "post" USING btree ("slug");
--> statement-breakpoint
DO $post_slug_index_guard$
DECLARE
  post_table oid := 'public.post'::regclass;
  slug_attnum smallint;
  index_is_valid boolean;
BEGIN
  SELECT attnum
  INTO slug_attnum
  FROM pg_attribute
  WHERE attrelid = post_table
    AND attname = 'slug'
    AND NOT attisdropped;

  SELECT
    index_catalog.indisunique
    AND index_catalog.indisvalid
    AND index_catalog.indisready
    AND index_catalog.indnatts = 1
    AND index_catalog.indnkeyatts = 1
    AND index_catalog.indkey[0] = slug_attnum
    AND index_catalog.indpred IS NULL
    AND index_catalog.indexprs IS NULL
    AND index_relation.relam = (SELECT oid FROM pg_am WHERE amname = 'btree')
  INTO index_is_valid
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation ON index_relation.oid = index_catalog.indexrelid
  WHERE index_relation.oid = to_regclass('public.post_slug_unique')
    AND index_relation.relnamespace = 'public'::regnamespace
    AND index_catalog.indrelid = post_table;

  IF NOT FOUND OR index_is_valid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Index public.post_slug_unique is missing, invalid, or does not uniquely index post.slug.'
      USING HINT = 'Inspect pg_index; drop an invalid index with DROP INDEX CONCURRENTLY public.post_slug_unique, then rerun this migration.';
  END IF;
END
$post_slug_index_guard$;
--> statement-breakpoint
DO $post_slug_backfill$
DECLARE
  remaining_count bigint;
  attempt_count integer;
  conflict_constraint text;
  batch_ids uuid[];
  last_id uuid;
BEGIN
  LOOP
    SELECT array_agg(selected.id ORDER BY selected.id)
    INTO batch_ids
    FROM (
      SELECT post.id
      FROM post
      WHERE post.slug IS NULL
        AND (last_id IS NULL OR post.id > last_id)
      ORDER BY post.id
      LIMIT 1000
    ) AS selected;

    EXIT WHEN batch_ids IS NULL;
    attempt_count := 0;
    LOOP
      attempt_count := attempt_count + 1;
      BEGIN
        UPDATE post
        SET slug = public.generate_post_slug()
        WHERE post.id = ANY(batch_ids)
          AND post.slug IS NULL;

        EXIT;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS conflict_constraint = CONSTRAINT_NAME;
        IF conflict_constraint IS DISTINCT FROM 'post_slug_unique'
          OR attempt_count >= 5 THEN
          RAISE;
        END IF;
      END;
    END LOOP;

    last_id := batch_ids[array_length(batch_ids, 1)];
    COMMIT;
  END LOOP;

  SELECT count(*)
  INTO remaining_count
  FROM post
  WHERE slug IS NULL;

  IF remaining_count > 0 THEN
    RAISE EXCEPTION
      'Cannot complete Post slug backfill: % row(s) remain NULL.',
      remaining_count
    USING HINT = 'Rerun this migration after resolving the cause; committed slug batches are preserved.';
  END IF;
END
$post_slug_backfill$;
--> statement-breakpoint
DO $post_slug_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'post'::regclass
      AND conname = 'post_slug_format'
  ) THEN
    ALTER TABLE post
      ADD CONSTRAINT post_slug_format
      CHECK (slug ~ '^[A-Za-z0-9]{12}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'post'::regclass
      AND conname = 'post_slug_not_null'
  ) THEN
    ALTER TABLE post
      ADD CONSTRAINT post_slug_not_null NOT NULL slug NOT VALID;
  END IF;
END
$post_slug_constraints$;
--> statement-breakpoint
ALTER TABLE "post" VALIDATE CONSTRAINT "post_slug_format";
--> statement-breakpoint
ALTER TABLE "post" VALIDATE CONSTRAINT "post_slug_not_null";
