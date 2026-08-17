import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('uses the standard PG environment for the process database', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "const { pg } = await import('./db/index.ts'); const expected = { host: ['db.example'], port: [6543], user: 'kosmo_runtime', database: 'kosmo', pass: process.env.PGPASSWORD }; for (const [key, value] of Object.entries(expected)) if (JSON.stringify(pg.options[key]) !== JSON.stringify(value)) throw new Error(key + ' option mismatch'); await pg.end({ timeout: 0 });",
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgres://owner@legacy.example:5432/legacy',
        DATABASE_PASSWORD: 'legacy-password',
        PGHOST: 'db.example',
        PGPORT: '6543',
        PGUSER: 'kosmo_runtime',
        PGDATABASE: 'kosmo',
        PGPASSWORD: 'slash/at@question?hash#percent%',
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
});
