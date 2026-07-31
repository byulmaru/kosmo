import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const previousMigrations = [
  '20260711065623_light_groot',
  '20260711154404_dashing_marauders',
  '20260711162858_add_activitypub_actor_remote_metadata',
  '20260712053904_shocking_human_fly',
  '20260714085502_flaky_abomination',
  '20260715011345_add_notification',
  '20260715154358_merge_migration_heads',
  '20260715154418_use_postgres_uuidv7',
  '20260716052716_swift_speed',
  '20260720142711_tidy_angel',
  '20260720151915_dapper_lady_mastermind',
  '20260721114209_prod_407_reaction_profile_ordering',
  '20260721131532_broken_nighthawk',
  '20260722082715_large_scalphunter',
  '20260723021105_amused_brood',
  '20260723075324_prod_413_reaction_notification',
  '20260723145546_prod_412_repost_notification',
  '20260724180954_prod_426_reply_notification',
  '20260727042621_prod_439_media_upload_state',
  '20260727063711_prod_494_reply_parent_set_null',
  '20260727082945_prod_441_ready_media',
  '20260727134259_prod_498_activitypub_reaction',
  '20260728082709_prod_489_remove_account_profile_admin',
  '20260729014146_jazzy_silvermane',
  '20260730113348_prod_581_media_representation',
  '20260730140803_conscious_viper',
].map((name) => new URL(`../../../drizzle/${name}/migration.sql`, import.meta.url));
const remoteMediaMigration = new URL(
  '../../../drizzle/20260731012813_prod_585_remote_media/migration.sql',
  import.meta.url,
);

const ids = {
  account: '00000000-0000-8000-8000-000000000001',
  instance: '00000000-0000-8000-8000-000000000002',
  profile: '00000000-0000-8000-8000-000000000003',
  readyMedia: '00000000-0000-8000-8000-000000000004',
  uploadingMedia: '00000000-0000-8000-8000-000000000005',
};

test('adds Remote Media invariants after Local READY representation backfill', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migration of previousMigrations) {
      await sql.unsafe(await readFile(migration, 'utf8'));
    }
    await seedBackfilledLocalMedia(sql);

    const rowsBefore = await getMediaRows(sql);
    await sql.unsafe(await readFile(remoteMediaMigration, 'utf8'));

    assert.deepEqual(await getMediaRows(sql), rowsBefore);
    assert.deepEqual(
      [
        ...(await sql`
        SELECT column_name AS "columnName", is_nullable AS "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'media'
          AND column_name IN ('account_id', 'storage_reference', 'upload_expires_at')
        ORDER BY column_name
      `),
      ],
      [
        { columnName: 'account_id', isNullable: 'YES' },
        { columnName: 'storage_reference', isNullable: 'YES' },
        { columnName: 'upload_expires_at', isNullable: 'YES' },
      ],
    );

    await sql`
      INSERT INTO media (source, state, profile_id, media_type, url)
      VALUES ('REMOTE', 'READY', ${ids.profile}, NULL, 'https://remote.example/image.webp')
    `;
    await assert.rejects(
      sql`
        INSERT INTO media (source, state, profile_id, url)
        VALUES ('REMOTE', 'READY', ${ids.profile}, 'https://remote.example/image.webp')
      `,
      { code: '23505' },
    );
    await assert.rejects(
      sql`
        INSERT INTO media (source, state, profile_id, url)
        VALUES ('REMOTE', 'UPLOADING', ${ids.profile}, 'https://remote.example/other.webp')
      `,
      { code: '23514' },
    );
    await assert.rejects(
      sql`
        INSERT INTO media (
          source,
          state,
          account_id,
          profile_id,
          storage_reference,
          upload_expires_at,
          url
        )
        VALUES (
          'REMOTE',
          'READY',
          ${ids.account},
          ${ids.profile},
          'remote-must-not-have-storage',
          now(),
          'https://remote.example/other.webp'
        )
      `,
      { code: '23514' },
    );
  } finally {
    await sql.end();
  }
});

async function seedBackfilledLocalMedia(sql) {
  await sql`
    INSERT INTO account (id, state, oidc_subject, display_name)
    VALUES (${ids.account}, 'ACTIVE', 'remote-media-migration', 'Remote Media Migration')
  `;
  await sql`
    INSERT INTO instance (id, domain, kind, state)
    VALUES (${ids.instance}, 'remote-media-migration.example', 'LOCAL', 'ACTIVE')
  `;
  await sql`
    INSERT INTO profile (
      id,
      instance_id,
      state,
      handle,
      normalized_handle,
      display_name,
      follow_policy
    )
    VALUES (
      ${ids.profile},
      ${ids.instance},
      'ACTIVE',
      'migration',
      'migration',
      'Migration',
      'OPEN'
    )
  `;
  await sql`
    INSERT INTO media (
      id,
      source,
      state,
      account_id,
      profile_id,
      media_type,
      url,
      storage_reference,
      upload_expires_at,
      ready_at
    )
    VALUES
      (
        ${ids.readyMedia},
        'LOCAL',
        'READY',
        ${ids.account},
        ${ids.profile},
        'image/webp',
        'https://media.example/ready.webp',
        'ready',
        now(),
        now()
      ),
      (
        ${ids.uploadingMedia},
        'LOCAL',
        'UPLOADING',
        ${ids.account},
        ${ids.profile},
        NULL,
        NULL,
        'uploading',
        now(),
        NULL
      )
  `;
}

async function getMediaRows(sql) {
  return [
    ...(await sql`
      SELECT
        id::text,
        source,
        state,
        account_id::text AS "accountId",
        profile_id::text AS "profileId",
        media_type AS "mediaType",
        alt_text AS "altText",
        url,
        storage_reference AS "storageReference",
        ready_at AS "readyAt"
      FROM media
      ORDER BY id
    `),
  ];
}
