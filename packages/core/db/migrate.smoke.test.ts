import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import drizzleConfig from '../drizzle.config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration smoke tests.');
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '../..');
const migrationsRoot = drizzleConfig.out;
const migrationCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const localMigrations = readMigrationFiles({ migrationsFolder: migrationsRoot });
const migrationNames = localMigrations.map(({ name }) => name);
const runtimeRoles = ['kosmo_api', 'kosmo_runtime', 'kosmo_worker'] as const;
const currentTablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
const forbiddenTablePrivileges = ['TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

assert.ok(migrationNames.length > 0, 'The repository must contain Drizzle migrations.');
assert.equal(
  localMigrations.some(({ sql: statements }) =>
    statements.some((statement) => /\b(?:CREATE|ALTER)\s+ROLE\b|\bPASSWORD\b/i.test(statement)),
  ),
  false,
  'Application migrations must not create or alter runtime roles or credentials.',
);

const firstRun = runMigrationEntrypoint();
assert.equal(firstRun.status, 0, formatFailure('blank database migration replay failed', firstRun));
assert.equal(
  firstRun.signal,
  null,
  formatFailure('blank database migration replay was signalled', firstRun),
);

const sql = postgres(databaseUrl, { max: 1 });
const { schema: migrationsSchema, table: migrationsTable } = drizzleConfig.migrations;
type MigrationHistoryRow = {
  id: number;
  name: string | null;
  hash: string;
  createdAt: string;
  appliedAt: string | null;
};
const readHistory = () => sql<MigrationHistoryRow[]>`
  SELECT id, name, hash, created_at::text AS "createdAt", applied_at::text AS "appliedAt"
  FROM ${sql(migrationsSchema)}.${sql(migrationsTable)}
  ORDER BY id ASC
`;

try {
  const freshHistory = await readHistory();

  assert.equal(
    freshHistory.length,
    migrationNames.length,
    'Migration history row count must match local files.',
  );
  assert.deepEqual(
    freshHistory.map(({ name }) => name),
    migrationNames,
    'Fresh migration history must contain all local migration names in version-control order.',
  );
  // Reverse the disposable fixture's history IDs to model a parallel-branch
  // apply order while preserving each migration's name, hash, and timestamps.
  await sql`UPDATE ${sql(migrationsSchema)}.${sql(migrationsTable)} SET id = -id`;
  const nonlinearHistory = await readHistory();
  assert.notDeepEqual(
    nonlinearHistory.map(({ name }) => name),
    freshHistory.map(({ name }) => name),
    'Smoke fixture must reorder history into a non-linear order.',
  );
  assert.deepEqual(
    [...nonlinearHistory].sort((a, b) => a.name!.localeCompare(b.name!)).map(({ name }) => name),
    migrationNames,
    'Non-linear history must preserve the complete local name set.',
  );

  const secondRun = runMigrationEntrypoint();
  assert.equal(
    secondRun.status,
    0,
    formatFailure('non-linear history no-op rerun failed', secondRun),
  );
  assert.equal(
    secondRun.signal,
    null,
    formatFailure('non-linear history no-op rerun was signalled', secondRun),
  );

  const historyAfterNoop = await readHistory();
  assert.deepEqual(
    historyAfterNoop,
    nonlinearHistory,
    'Non-linear no-op rerun must not change migration history.',
  );

  const objects = await sql<{ objectName: string | null }[]>`
    SELECT to_regclass(object_name)::text AS "objectName"
    FROM unnest(${sql.array([
      'public.account',
      'public.profile',
      'public.post',
      'public.media',
      'public.profile_media',
      'public.profile_mute',
      'public.hashtag',
    ])}::text[]) AS object_name
  `;

  assert.deepEqual(
    objects.map(({ objectName }) => objectName),
    ['account', 'profile', 'post', 'media', 'profile_media', 'profile_mute', 'hashtag'],
    'Representative final schema tables must exist.',
  );

  const actorHelpers = await sql<{ functionName: string | null }[]>`
    SELECT to_regprocedure(function_name)::text AS "functionName"
    FROM unnest(${sql.array([
      'public.kosmo_current_account_id()',
      'public.kosmo_current_profile_id()',
    ])}::text[]) AS function_name
  `;
  assert.deepEqual(
    actorHelpers.map(({ functionName }) => functionName),
    [null, null],
    'RLS actor helper functions must not exist after the final migration.',
  );

  const columns = Array.from(
    await sql<{ tableName: string; columnName: string }[]>`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'post' AND column_name IN ('reply_parent_id', 'repost_source_id'))
          OR (
            table_name = 'media'
            AND column_name IN ('source', 'state', 'storage_reference', 'media_type', 'url', 'ready_at', 'alt_text')
          )
          OR (
            table_name = 'profile_mute'
            AND column_name IN ('created_at', 'expires_at', 'owner_profile_id', 'target_profile_id')
          )
        )
      ORDER BY table_name, column_name
    `,
  );

  assert.deepEqual(
    columns,
    [
      { tableName: 'media', columnName: 'alt_text' },
      { tableName: 'media', columnName: 'media_type' },
      { tableName: 'media', columnName: 'ready_at' },
      { tableName: 'media', columnName: 'source' },
      { tableName: 'media', columnName: 'state' },
      { tableName: 'media', columnName: 'storage_reference' },
      { tableName: 'media', columnName: 'url' },
      { tableName: 'post', columnName: 'reply_parent_id' },
      { tableName: 'post', columnName: 'repost_source_id' },
      { tableName: 'profile_mute', columnName: 'created_at' },
      { tableName: 'profile_mute', columnName: 'expires_at' },
      { tableName: 'profile_mute', columnName: 'owner_profile_id' },
      { tableName: 'profile_mute', columnName: 'target_profile_id' },
    ],
    'Representative final schema columns must exist.',
  );

  await assertRuntimeAcl(sql);
} finally {
  await sql.end({ timeout: 5 });
}

async function assertRuntimeAcl(sql: ReturnType<typeof postgres>) {
  const roles = Array.from(
    await sql<RuntimeRole[]>`
    SELECT
      rolname AS "roleName",
      rolcanlogin AS "canLogin",
      rolinherit AS "inherit",
      rolsuper AS "superuser",
      rolcreatedb AS "createdb",
      rolcreaterole AS "createrole",
      rolreplication AS "replication",
      rolbypassrls AS "bypassRls"
    FROM pg_roles
    WHERE rolname = ANY(${sql.array([...runtimeRoles])}::text[])
    ORDER BY rolname
  `,
  );

  assert.deepEqual(
    roles,
    [
      {
        roleName: 'kosmo_api',
        canLogin: true,
        inherit: true,
        superuser: false,
        createdb: false,
        createrole: false,
        replication: false,
        bypassRls: false,
      },
      {
        roleName: 'kosmo_runtime',
        canLogin: true,
        inherit: true,
        superuser: false,
        createdb: false,
        createrole: false,
        replication: false,
        bypassRls: false,
      },
      {
        roleName: 'kosmo_worker',
        canLogin: true,
        inherit: true,
        superuser: false,
        createdb: false,
        createrole: false,
        replication: false,
        bypassRls: true,
      },
    ],
    'Disposable runtime role attributes must match the PROD-780 contract.',
  );

  const memberships = Array.from(
    await sql<{ member: string; grantedRole: string }[]>`
    SELECT member.rolname AS member, granted.rolname AS "grantedRole"
    FROM pg_auth_members
    JOIN pg_roles AS member ON member.oid = pg_auth_members.member
    JOIN pg_roles AS granted ON granted.oid = pg_auth_members.roleid
    WHERE member.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
    ORDER BY member.rolname, granted.rolname
  `,
  );
  assert.deepEqual(memberships, [], 'Runtime roles must not inherit role memberships.');

  const schemaAcl = Array.from(
    await sql<SchemaPrivilege[]>`
    SELECT
      grantee.rolname AS "roleName",
      privilege_type AS "privilegeType",
      is_grantable AS "isGrantable"
    FROM pg_namespace AS namespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) AS acl
    JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND grantee.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
    ORDER BY grantee.rolname, privilege_type
  `,
  );
  assert.deepEqual(
    schemaAcl,
    [
      { roleName: 'kosmo_api', privilegeType: 'USAGE', isGrantable: false },
      { roleName: 'kosmo_runtime', privilegeType: 'USAGE', isGrantable: false },
      { roleName: 'kosmo_worker', privilegeType: 'USAGE', isGrantable: false },
    ],
    'Runtime roles must have only non-delegable public schema USAGE.',
  );

  for (const role of runtimeRoles) {
    const [{ canCreateInSchema }] = await sql<{ canCreateInSchema: boolean }[]>`
      SELECT has_schema_privilege(${role}, 'public', 'CREATE') AS "canCreateInSchema"
    `;
    assert.equal(canCreateInSchema, false, `${role} must not have public schema CREATE.`);
  }

  const publicTables = Array.from(
    await sql<ApplicationTable[]>`
    SELECT
      class.relname AS "tableName",
      pg_get_userbyid(class.relowner) AS owner
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
    ORDER BY class.relname
  `,
  );
  assert.ok(publicTables.length > 0, 'The replay must create application tables.');
  assert.ok(
    publicTables.every(({ owner }) => owner === 'kosmo'),
    'Every application table must remain owned by kosmo.',
  );

  const directTableAcl = Array.from(
    await sql<TablePrivilege[]>`
    SELECT
      class.relname AS "tableName",
      grantee.rolname AS "roleName",
      privilege_type AS "privilegeType",
      is_grantable AS "isGrantable"
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(class.relacl, acldefault('r', class.relowner))
    ) AS acl
    JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p')
      AND grantee.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
    ORDER BY class.relname, grantee.rolname, privilege_type
  `,
  );
  const expectedTableAcl = new Set(
    publicTables.flatMap(({ tableName }) =>
      runtimeRoles.flatMap((roleName) =>
        currentTablePrivileges.map((privilegeType) => `${tableName}|${roleName}|${privilegeType}`),
      ),
    ),
  );
  assert.equal(
    directTableAcl.length,
    expectedTableAcl.size,
    'Each runtime role must receive exactly the four current-table DML privileges.',
  );
  for (const privilege of directTableAcl) {
    assert.equal(
      privilege.isGrantable,
      false,
      `${privilege.roleName} must not receive grant option on ${privilege.tableName}.`,
    );
    assert.equal(
      expectedTableAcl.delete(
        `${privilege.tableName}|${privilege.roleName}|${privilege.privilegeType}`,
      ),
      true,
      `Unexpected runtime ACL ${privilege.roleName}/${privilege.tableName}/${privilege.privilegeType}.`,
    );
  }
  assert.equal(expectedTableAcl.size, 0, 'Every expected current-table ACL must be present.');

  for (const role of runtimeRoles) {
    for (const { tableName } of publicTables) {
      const qualifiedTable = `public.${tableName}`;
      for (const privilege of forbiddenTablePrivileges) {
        const [{ hasPrivilege }] = await sql<{ hasPrivilege: boolean }[]>`
          SELECT has_table_privilege(${role}, ${qualifiedTable}, ${privilege}) AS "hasPrivilege"
        `;
        assert.equal(
          hasPrivilege,
          false,
          `${role} must not have ${privilege} on ${qualifiedTable}.`,
        );
      }
    }
  }

  const defaultAcl = Array.from(
    await sql<DefaultPrivilege[]>`
    SELECT
      default_acl.defaclobjtype AS "objectType",
      pg_get_userbyid(default_acl.defaclrole) AS owner,
      namespace.nspname AS "schemaName",
      grantee.rolname AS "roleName",
      privilege_type AS "privilegeType",
      is_grantable AS "isGrantable"
    FROM pg_default_acl AS default_acl
    LEFT JOIN pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) AS acl
    JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE grantee.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
    ORDER BY default_acl.defaclobjtype, grantee.rolname, privilege_type
  `,
  );
  const expectedDefaultAcl = new Set(
    runtimeRoles.flatMap((roleName) =>
      currentTablePrivileges.map((privilegeType) => `r|kosmo|public|${roleName}|${privilegeType}`),
    ),
  );
  assert.equal(
    defaultAcl.length,
    expectedDefaultAcl.size,
    'Default ACL must contain only owner-scoped table CRUD entries for runtime roles.',
  );
  for (const privilege of defaultAcl) {
    assert.equal(privilege.isGrantable, false, 'Default ACL must not grant delegation.');
    assert.equal(
      expectedDefaultAcl.delete(
        `${privilege.objectType}|${privilege.owner}|${privilege.schemaName}|${privilege.roleName}|${privilege.privilegeType}`,
      ),
      true,
      `Unexpected runtime default ACL ${JSON.stringify(privilege)}.`,
    );
  }
  assert.equal(expectedDefaultAcl.size, 0, 'Every expected runtime default ACL must be present.');

  const publicSequenceAcl = Array.from(
    await sql<TablePrivilege[]>`
    SELECT
      class.relname AS "tableName",
      grantee.rolname AS "roleName",
      privilege_type AS "privilegeType",
      is_grantable AS "isGrantable"
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(class.relacl, acldefault('S', class.relowner))
    ) AS acl
    JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND class.relkind = 'S'
      AND grantee.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
  `,
  );
  assert.deepEqual(publicSequenceAcl, [], 'PROD-724 must not grant application sequence access.');

  for (const role of runtimeRoles) {
    const [{ canUseSchema, canSelectHistory }] = await sql<
      { canUseSchema: boolean; canSelectHistory: boolean }[]
    >`
      SELECT
        has_schema_privilege(${role}, 'drizzle', 'USAGE') AS "canUseSchema",
        has_table_privilege(${role}, 'drizzle.__drizzle_migrations', 'SELECT') AS "canSelectHistory"
    `;
    assert.equal(canUseSchema, false, `${role} must not access the drizzle schema.`);
    assert.equal(canSelectHistory, false, `${role} must not read migration history.`);
  }

  await assertFutureTableDefaultAcl(sql);
  await assertRepresentativeDml(sql);
  await assertDeniedRuntimeOperations(sql);
}

async function assertFutureTableDefaultAcl(sql: ReturnType<typeof postgres>) {
  const tableName = `prod_724_acl_future_${process.pid}_${Date.now()}`;

  try {
    await sql`CREATE TABLE public.${sql(tableName)} (id integer PRIMARY KEY, value text NOT NULL)`;
    const [owner] = await sql<{ owner: string }[]>`
      SELECT pg_get_userbyid(relowner) AS owner
      FROM pg_class
      WHERE oid = ${`public.${tableName}`}::regclass
    `;
    assert.equal(owner?.owner, 'kosmo', 'Owner-created future table must remain owned by kosmo.');

    const privileges = Array.from(
      await sql<TablePrivilege[]>`
      SELECT
        grantee.rolname AS "roleName",
        privilege_type AS "privilegeType",
        is_grantable AS "isGrantable"
      FROM pg_class AS class
      JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
      CROSS JOIN LATERAL aclexplode(class.relacl) AS acl
      JOIN pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE namespace.nspname = 'public'
        AND class.relname = ${tableName}
        AND grantee.rolname = ANY(${sql.array([...runtimeRoles])}::text[])
      ORDER BY grantee.rolname, privilege_type
    `,
    );
    assert.deepEqual(
      privileges.map(({ roleName, privilegeType, isGrantable }) => ({
        roleName,
        privilegeType,
        isGrantable,
      })),
      runtimeRoles
        .flatMap((roleName) =>
          currentTablePrivileges.map((privilegeType) => ({
            roleName,
            privilegeType,
            isGrantable: false,
          })),
        )
        .sort((left, right) =>
          `${left.roleName}|${left.privilegeType}`.localeCompare(
            `${right.roleName}|${right.privilegeType}`,
          ),
        ),
      'Future owner-created tables must receive the same non-delegable CRUD ACL.',
    );
  } finally {
    await sql`DROP TABLE IF EXISTS public.${sql(tableName)}`;
  }
}

async function assertRepresentativeDml(sql: ReturnType<typeof postgres>) {
  for (const role of runtimeRoles) {
    const session = await sql.reserve();
    const domain = `prod-724-${role}-${process.pid}-${Date.now()}`;

    try {
      await session`SET ROLE ${sql(role)}`;
      const [{ currentUser }] = await session<{ currentUser: string }[]>`
        SELECT current_user AS "currentUser"
      `;
      assert.equal(currentUser, role, `${role} DML must execute under its runtime principal.`);

      const [{ id }] = await session<{ id: string }[]>`
        INSERT INTO public.instance (domain, kind)
        VALUES (${domain}, 'LOCAL')
        RETURNING id
      `;
      await session`
        UPDATE public.instance
        SET canonical_origin = ${`https://${domain}`}
        WHERE id = ${id}
      `;
      const [{ canonicalOrigin }] = await session<{ canonicalOrigin: string }[]>`
        SELECT canonical_origin AS "canonicalOrigin"
        FROM public.instance
        WHERE id = ${id}
      `;
      assert.equal(canonicalOrigin, `https://${domain}`);
      await session`DELETE FROM public.instance WHERE id = ${id}`;
    } finally {
      try {
        await session`RESET ROLE`;
      } finally {
        await session.release();
      }
    }
  }
}

async function assertDeniedRuntimeOperations(sql: ReturnType<typeof postgres>) {
  for (const role of runtimeRoles) {
    const tableName = `prod_724_acl_denied_${role}_${process.pid}_${Date.now()}`;
    await assertDenied(
      sql,
      role,
      'schema DDL',
      (session) => session`CREATE TABLE public.${session(tableName)} (id integer PRIMARY KEY)`,
      () => sql`DROP TABLE IF EXISTS public.${sql(tableName)}`,
    );
    await assertDenied(
      sql,
      role,
      'ownership transfer',
      (session) => session`ALTER TABLE public.instance OWNER TO kosmo_api`,
      () => sql`ALTER TABLE public.instance OWNER TO kosmo`,
    );
  }
}

async function assertDenied(
  sql: ReturnType<typeof postgres>,
  role: string,
  label: string,
  operation: (session: ReturnType<typeof postgres>) => Promise<unknown>,
  cleanup: () => Promise<unknown>,
) {
  const session = await sql.reserve();
  let failure: unknown;

  try {
    await session`SET ROLE ${sql(role)}`;
    try {
      await operation(session);
    } catch (error) {
      failure = error;
    }
  } finally {
    try {
      await session`RESET ROLE`;
    } finally {
      await session.release();
    }
  }

  if (failure === undefined) {
    await cleanup();
    assert.fail(`${role} unexpectedly succeeded at ${label}.`);
  }

  assert.match(
    String(failure),
    /permission denied|must be owner|not owner|insufficient privilege/i,
    `${role} ${label} failed for an unexpected reason.`,
  );
}

type RuntimeRole = {
  roleName: string;
  canLogin: boolean;
  inherit: boolean;
  superuser: boolean;
  createdb: boolean;
  createrole: boolean;
  replication: boolean;
  bypassRls: boolean;
};

type ApplicationTable = {
  tableName: string;
  owner: string;
};

type SchemaPrivilege = {
  roleName: string;
  privilegeType: string;
  isGrantable: boolean;
};

type TablePrivilege = {
  tableName: string;
  roleName: string;
  privilegeType: string;
  isGrantable: boolean;
};

type DefaultPrivilege = {
  objectType: string;
  owner: string;
  schemaName: string | null;
  roleName: string;
  privilegeType: string;
  isGrantable: boolean;
};

function runMigrationEntrypoint() {
  return spawnSync(migrationCommand, ['--filter', '@kosmo/core', 'db:migrate'], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
}

function formatFailure(
  description: string,
  result: ReturnType<typeof runMigrationEntrypoint>,
): string {
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  const error = result.error?.message;

  return [
    description,
    `cwd: ${repositoryRoot}`,
    'DATABASE_URL: set',
    `status: ${result.status ?? '(null)'}`,
    `signal: ${result.signal ?? '(none)'}`,
    error ? `spawn error: ${error}` : '',
    `stdout:\n${stdout || '(empty)'}`,
    `stderr:\n${stderr || '(empty)'}`,
  ]
    .filter(Boolean)
    .join('\n');
}
