import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { oncePostCommit } from './post-commit';
import type { Database } from '../db';

describe('PostCommit database handle', () => {
  it('forwards the first invocation handle and executes the effect once', async () => {
    const handle = {} as Database;
    const anotherHandle = {} as Database;
    const received: Array<Database | undefined> = [];
    const postCommit = oncePostCommit(async (database) => {
      received.push(database);
    });

    const first = postCommit(handle);
    const repeated = postCommit(anotherHandle);

    assert.equal(repeated, first);
    await first;
    assert.deepEqual(received, [handle]);
  });
});
