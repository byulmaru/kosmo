ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_profile_id_kind_source_id_unique";
--> statement-breakpoint
DROP INDEX "notification_recipient_profile_id_id_index";
--> statement-breakpoint
DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*)
  INTO orphan_count
  FROM notification AS n
  WHERE n.recipient_profile_id IS NOT NULL
    AND n.recipient_account_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM account_profile AS membership
      WHERE membership.profile_id = n.recipient_profile_id
    );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Cannot contract notifications: % legacy Profile notification(s) have no current account_profile membership.',
      orphan_count
    USING
      HINT = 'Restore an account_profile membership or reconcile the orphan notifications before retrying.';
  END IF;
END
$$;
--> statement-breakpoint
WITH ranked_legacy_notifications AS (
  SELECT
    n.id,
    membership.account_id,
    row_number() OVER (
      PARTITION BY n.id
      ORDER BY (membership.role = 'OWNER') DESC, membership.account_id ASC
    ) AS recipient_rank
  FROM notification AS n
  JOIN account_profile AS membership
    ON membership.profile_id = n.recipient_profile_id
  WHERE n.recipient_profile_id IS NOT NULL
    AND n.recipient_account_id IS NULL
),
assigned_legacy_notifications AS (
  UPDATE notification AS n
  SET recipient_account_id = ranked.account_id
  FROM ranked_legacy_notifications AS ranked
  WHERE ranked.recipient_rank = 1
    AND n.id = ranked.id
  RETURNING
    n.id,
    n.recipient_profile_id,
    n.recipient_account_id,
    n.kind,
    n.source_id,
    n.data,
    n.created_at,
    n.read_at
)
INSERT INTO notification (
  id,
  recipient_profile_id,
  recipient_account_id,
  kind,
  source_id,
  data,
  created_at,
  read_at
)
SELECT
  uuidv7(),
  original.recipient_profile_id,
  membership.account_id,
  original.kind,
  original.source_id,
  original.data,
  original.created_at,
  original.read_at
FROM assigned_legacy_notifications AS original
JOIN account_profile AS membership
  ON membership.profile_id = original.recipient_profile_id
WHERE membership.account_id <> original.recipient_account_id;
--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "recipient_account_id" SET NOT NULL;
