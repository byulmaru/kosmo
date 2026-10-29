UPDATE "profile_pinned_post"
SET "order_key" =
  decode('94', 'hex')
  || int4send(coalesce("position", 2147483647))
  || CASE WHEN "position" IS NULL THEN decode('01', 'hex') ELSE decode('00', 'hex') END
  || uuid_send("id")
WHERE "order_key" IS NULL;
