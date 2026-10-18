-- kosmo:transaction off
DO $notification_account_backfill$
DECLARE
  processed_count integer;
  unassignable_count bigint;
BEGIN
  SELECT count(*)
  INTO unassignable_count
  FROM notification AS n
  WHERE n.recipient_account_id IS NULL
    AND (
      n.recipient_profile_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM account_profile AS membership
        WHERE membership.profile_id = n.recipient_profile_id
      )
    );

  IF unassignable_count > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill notification recipients: % row(s) have no current Profile membership.',
      unassignable_count
    USING HINT = 'Restore a current account_profile membership or reconcile the recipient data, then retry the migration.';
  END IF;

  LOOP
    WITH selected AS MATERIALIZED (
      SELECT n.id, n.recipient_profile_id
      FROM notification AS n
      WHERE n.recipient_account_id IS NULL
        AND n.recipient_profile_id IS NOT NULL
      ORDER BY n.id
      LIMIT 1000
      FOR UPDATE
    ),
    ranked_memberships AS (
      SELECT
        selected.id,
        membership.account_id,
        row_number() OVER (
          PARTITION BY selected.id
          ORDER BY (membership.role = 'OWNER') DESC, membership.account_id ASC
        ) AS recipient_rank
      FROM selected
      JOIN account_profile AS membership
        ON membership.profile_id = selected.recipient_profile_id
    ),
    updated_originals AS (
      UPDATE notification AS n
      SET recipient_account_id = ranked.account_id
      FROM ranked_memberships AS ranked
      WHERE ranked.recipient_rank = 1
        AND n.id = ranked.id
        AND n.recipient_account_id IS NULL
      RETURNING
        n.id,
        n.recipient_profile_id,
        n.recipient_account_id,
        n.kind,
        n.source_id,
        n.data,
        n.created_at,
        n.read_at
    ),
    inserted_copies AS (
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
      FROM updated_originals AS original
      JOIN account_profile AS membership
        ON membership.profile_id = original.recipient_profile_id
      WHERE membership.account_id <> original.recipient_account_id
      RETURNING id
    )
    SELECT count(*)::integer
    INTO processed_count
    FROM updated_originals;

    EXIT WHEN processed_count = 0;
    COMMIT;
  END LOOP;

  SELECT count(*)
  INTO unassignable_count
  FROM notification AS n
  WHERE n.recipient_account_id IS NULL;

  IF unassignable_count > 0 THEN
    RAISE EXCEPTION
      'Cannot complete notification backfill: % row(s) still have a NULL recipient Account.',
      unassignable_count
    USING HINT = 'Reconcile the remaining notification recipients and rerun the migration; committed batches are preserved.';
  END IF;
END
$notification_account_backfill$;
