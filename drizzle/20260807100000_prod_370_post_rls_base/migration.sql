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
    WHEN pg_catalog.pg_input_is_valid(
      pg_catalog.current_setting('kosmo.account_id', true),
      'pg_catalog.uuid'
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
    WHEN pg_catalog.pg_input_is_valid(
      pg_catalog.current_setting('kosmo.profile_id', true),
      'pg_catalog.uuid'
    )
    THEN pg_catalog.current_setting('kosmo.profile_id', true)::pg_catalog.uuid
    ELSE NULL::pg_catalog.uuid
  END
$function$;
