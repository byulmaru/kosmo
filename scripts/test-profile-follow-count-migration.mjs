import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pg } from '../packages/core/db/index.ts';

const root = resolve(import.meta.dirname, '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kosmo-migration-'));
const initialMigrations = join(temporaryDirectory, 'drizzle');
const temporaryConfig = join(temporaryDirectory, 'drizzle.config.ts');

try {
  cpSync(
    join(root, 'drizzle/20260711065623_light_groot'),
    join(initialMigrations, '20260711065623_light_groot'),
    {
      recursive: true,
    },
  );
  writeFileSync(
    temporaryConfig,
    `import { defineConfig } from 'drizzle-kit';\nexport default defineConfig({ dialect: 'postgresql', out: ${JSON.stringify(initialMigrations)}, dbCredentials: { url: process.env.DATABASE_URL! } });\n`,
  );

  migrate(temporaryConfig);

  const instanceId = randomUUID();
  const followerId = randomUUID();
  const followeeId = randomUUID();
  const secondFollowerId = randomUUID();
  const followIds = [randomUUID(), randomUUID(), randomUUID()];

  await pg.unsafe(`insert into instance (id, domain, kind) values ($1, $2, 'LOCAL')`, [
    instanceId,
    `migration-${instanceId}.example`,
  ]);
  await pg.unsafe(
    `insert into profile (id, instance_id, handle, normalized_handle, display_name, follow_policy)
     values ($1, $4, 'follower', 'follower', 'Follower', 'OPEN'),
            ($2, $4, 'followee', 'followee', 'Followee', 'OPEN'),
            ($3, $4, 'second', 'second', 'Second', 'OPEN')`,
    [followerId, followeeId, secondFollowerId, instanceId],
  );
  await pg.unsafe(
    `insert into profile_follow (id, follower_profile_id, followee_profile_id)
     values ($1, $4, $5), ($2, $6, $5), ($3, $4, $6)`,
    [...followIds, followerId, followeeId, secondFollowerId],
  );

  migrate(join(root, 'packages/core/drizzle.config.ts'));
  await assertCounts(followerId, followeeId, secondFollowerId);

  const migrationCount = await appliedMigrationCount();
  migrate(join(root, 'packages/core/drizzle.config.ts'));
  if ((await appliedMigrationCount()) !== migrationCount) {
    throw new Error('Repeated migrate changed the applied migration count.');
  }
  await assertCounts(followerId, followeeId, secondFollowerId);
} finally {
  await pg.end();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function migrate(config) {
  const result = spawnSync(
    join(root, 'packages/core/node_modules/.bin/drizzle-kit'),
    ['migrate', '--config', config],
    { cwd: root, env: process.env, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`drizzle-kit migrate failed (${result.status ?? 1}).`);
  }
}

async function appliedMigrationCount() {
  const [row] = await pg.unsafe(`select count(*)::int as count from drizzle.__drizzle_migrations`);
  return row.count;
}

async function assertCounts(followerId, followeeId, secondFollowerId) {
  const profiles = await pg.unsafe(
    `select id, followers_count, following_count from profile where id = any($1::uuid[]) order by id`,
    [[followerId, followeeId, secondFollowerId]],
  );
  const expected = new Map([
    [followerId, [0, 2]],
    [followeeId, [2, 0]],
    [secondFollowerId, [1, 1]],
  ]);
  for (const profile of profiles) {
    const counts = expected.get(profile.id);
    if (!counts || profile.followers_count !== counts[0] || profile.following_count !== counts[1]) {
      throw new Error(`Unexpected backfill result for ${profile.id}.`);
    }
  }
  const [{ count }] = await pg.unsafe(`select count(*)::int as count from profile_follow`);
  if (count !== 3) {
    throw new Error('Migration did not preserve existing follow rows.');
  }
}
