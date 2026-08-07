import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { db, getDatabaseConnection, pg } from '../db';

after(async () => {
  await pg.end();
});

test('database handle selection preserves owner fallback and caller transaction identity', async () => {
  assert.equal(getDatabaseConnection(), db);
  assert.equal(getDatabaseConnection(db), db);

  await db.transaction(async (transaction) => {
    assert.equal(getDatabaseConnection(transaction), transaction);
  });
});
