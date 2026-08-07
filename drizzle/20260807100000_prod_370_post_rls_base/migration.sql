ALTER TABLE "post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "public"."kosmo_current_account_id"()
RETURNS pg_catalog.uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
AS $function$
  SELECT CASE
    WHEN pg_catalog.regexp_like(
      pg_catalog.current_setting('kosmo.account_id', true),
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      'i'
    )
    THEN pg_catalog.current_setting('kosmo.account_id', true)::pg_catalog.uuid
    ELSE NULL::pg_catalog.uuid
  END
$function$;--> statement-breakpoint
CREATE FUNCTION "public"."kosmo_current_profile_id"()
RETURNS pg_catalog.uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
AS $function$
  SELECT CASE
    WHEN pg_catalog.regexp_like(
      pg_catalog.current_setting('kosmo.profile_id', true),
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      'i'
    )
    THEN pg_catalog.current_setting('kosmo.profile_id', true)::pg_catalog.uuid
    ELSE NULL::pg_catalog.uuid
  END
$function$;
