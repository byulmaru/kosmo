import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runDatabaseScript = (script: string, readHost?: string) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: 'postgres://owner@legacy.example:5432/legacy',
    DATABASE_PASSWORD: 'legacy-password',
    PGHOST: 'db.example',
    PGPORT: '6543',
    PGUSER: 'kosmo_runtime',
    PGDATABASE: 'kosmo',
    PGPASSWORD: 'slash/at@question?hash#percent%',
  };
  if (readHost) {
    env.PGREADHOST = readHost;
  } else {
    delete env.PGREADHOST;
  }

  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
};

test('uses PGREADHOST and routes reads, writes, transactions, and primary scopes correctly', () => {
  const result = runDatabaseScript(
    `
      const { db, pg, pgRead, withPrimaryDatabase } = await import('./db/index.ts');
      const { integer, pgTable } = await import('drizzle-orm/pg-core');
      if (!pgRead) throw new Error('read client was not created');
      const expectedPrimary = {
        host: ['db.example'], port: [6543], user: 'kosmo_runtime', database: 'kosmo',
        pass: process.env.PGPASSWORD, max_lifetime: 3600, max: 20, prepare: false,
      };
      const expectedReplica = { ...expectedPrimary, host: ['read.example'] };
      for (const [key, value] of Object.entries(expectedPrimary)) {
        if (JSON.stringify(pg.options[key]) !== JSON.stringify(value)) throw new Error('primary ' + key + ' mismatch');
      }
      for (const [key, value] of Object.entries(expectedReplica)) {
        if (JSON.stringify(pgRead.options[key]) !== JSON.stringify(value)) throw new Error('replica ' + key + ' mismatch');
      }
      const table = pgTable('replica_routing_test', { id: integer('id').primaryKey() });
      const queries = [];
      const result = () => {
        const rows = Promise.resolve([]);
        rows.values = async () => [];
        return rows;
      };
      const track = (client, label) => {
        client.unsafe = () => {
          queries.push(label);
          return result();
        };
      };
      track(pg, 'primary');
      track(pgRead, 'replica');
      let transactions = 0;
      pg.begin = (callback) => {
        transactions++;
        return callback(pg);
      };

      await db.select().from(table).limit(1);
      await db.insert(table).values({ id: 1 });
      await db.transaction(async (tx) => {
        await tx.select().from(table).limit(1);
        await tx.insert(table).values({ id: 2 });
      });
      await withPrimaryDatabase(async () => {
        await Promise.resolve();
        await db.select().from(table).limit(1);
        await withPrimaryDatabase(async () => {
          await Promise.resolve();
          await db.select().from(table).limit(1);
        });
        await db.select().from(table).limit(1);
      });

      let enterPrimary;
      let releasePrimary;
      const entered = new Promise((resolve) => { enterPrimary = resolve; });
      const gate = new Promise((resolve) => { releasePrimary = resolve; });
      const primaryRead = withPrimaryDatabase(async () => {
        enterPrimary();
        await gate;
        await db.select().from(table).limit(1);
      });
      await entered;
      await db.select().from(table).limit(1);
      releasePrimary();
      await primaryRead;

      const expected = ['replica', 'primary', 'primary', 'primary', 'primary', 'primary', 'primary', 'replica', 'primary'];
      if (JSON.stringify(queries) !== JSON.stringify(expected)) throw new Error('unexpected query routes: ' + JSON.stringify(queries));
      if (transactions !== 1) throw new Error('transaction did not start on the primary');
      await Promise.all([pg.end({ timeout: 0 }), pgRead.end({ timeout: 0 })]);
    `,
    'read.example',
  );

  assert.equal(result.status, 0, result.stderr);
});

test('reuses the primary client when PGREADHOST is absent', () => {
  const result = runDatabaseScript(`
    const { db, pg, pgRead } = await import('./db/index.ts');
    const { integer, pgTable } = await import('drizzle-orm/pg-core');
    if (pgRead !== undefined) throw new Error('read client exists without PGREADHOST');
    const table = pgTable('replica_routing_test', { id: integer('id').primaryKey() });
    let queries = 0;
    pg.unsafe = () => {
      queries++;
      const rows = Promise.resolve([]);
      rows.values = async () => [];
      return rows;
    };
    await db.select().from(table).limit(1);
    if (queries !== 1) throw new Error('fallback SELECT did not use the primary');
    await pg.end({ timeout: 0 });
  `);

  assert.equal(result.status, 0, result.stderr);
});
