import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import postgres from 'postgres';

const migrationName = '20260728082709_prod_489_remove_account_profile_admin';
const migrationsRoot = new URL('../../../drizzle/', import.meta.url);
const roleMigration = new URL(`${migrationName}/migration.sql`, migrationsRoot);

const instanceId = '00000000-0000-8000-8000-000000000001';
const ownerAccountId = '00000000-0000-8000-8000-000000000002';
const memberAccountId = '00000000-0000-8000-8000-000000000003';
const ownerProfileId = '00000000-0000-8000-8000-000000000004';
const memberProfileId = '00000000-0000-8000-8000-000000000005';

const applyPreviousMigrations = async (sql) => {
  const migrationDirectories = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name < migrationName)
    .map((entry) => entry.name)
    .sort();

  for (const directory of migrationDirectories) {
    await sql.unsafe(await readFile(new URL(`${directory}/migration.sql`, migrationsRoot), 'utf8'));
  }
};

const seedMemberships = async (sql, roles) => {
  await sql`
    INSERT INTO instance (id, domain, kind, state)
    VALUES (${instanceId}, 'local.test', 'LOCAL', 'ACTIVE')
  `;
  await sql`
    INSERT INTO account (id, oidc_subject, display_name, state)
    VALUES
      (${ownerAccountId}, 'owner', 'Owner', 'ACTIVE'),
      (${memberAccountId}, 'member', 'Member', 'ACTIVE')
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
    ) VALUES
      (${ownerProfileId}, ${instanceId}, 'ACTIVE', 'owner', 'owner', 'Owner', 'OPEN'),
      (${memberProfileId}, ${instanceId}, 'ACTIVE', 'member', 'member', 'Member', 'OPEN')
  `;
  await sql`
    INSERT INTO account_profile (account_id, profile_id, role)
    VALUES
      (${ownerAccountId}, ${ownerProfileId}, ${roles[0]}),
      (${memberAccountId}, ${memberProfileId}, ${roles[1]})
  `;
};

const loadRoleValues = (sql) => sql`
  SELECT enum_value.enumlabel AS value
  FROM pg_enum AS enum_value
  INNER JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
  WHERE enum_type.typname = 'account_profile_role'
  ORDER BY enum_value.enumsortorder
`;

test('removes Account Profile Admin while preserving Owner and Member rows', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await applyPreviousMigrations(sql);
    await seedMemberships(sql, ['OWNER', 'MEMBER']);

    await sql.unsafe(await readFile(roleMigration, 'utf8'));

    assert.deepEqual([...(await loadRoleValues(sql))], [{ value: 'OWNER' }, { value: 'MEMBER' }]);
    assert.deepEqual(
      [
        ...(await sql`
          SELECT account_id::text AS "accountId", role::text
          FROM account_profile
          ORDER BY account_id
        `),
      ],
      [
        { accountId: ownerAccountId, role: 'OWNER' },
        { accountId: memberAccountId, role: 'MEMBER' },
      ],
    );
    await assert.rejects(
      sql`
        INSERT INTO account_profile (account_id, profile_id, role)
        VALUES (${ownerAccountId}, ${memberProfileId}, 'ADMIN')
      `,
      { code: '22P02' },
    );
  } finally {
    await sql.end();
  }
});

test('fails instead of converting an unexpected Account Profile Admin row', async () => {
  assert.ok(process.env.DATABASE_URL);
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await applyPreviousMigrations(sql);
    await seedMemberships(sql, ['OWNER', 'ADMIN']);

    await assert.rejects(sql.unsafe(await readFile(roleMigration, 'utf8')), { code: '22P02' });

    assert.deepEqual(
      [...(await loadRoleValues(sql))],
      [{ value: 'OWNER' }, { value: 'ADMIN' }, { value: 'MEMBER' }],
    );
    assert.deepEqual(
      [...(await sql`SELECT role::text FROM account_profile ORDER BY account_id`)],
      [{ role: 'OWNER' }, { role: 'ADMIN' }],
    );
  } finally {
    await sql.end();
  }
});
