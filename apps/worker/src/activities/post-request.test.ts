import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import { ApplicationFailure } from '@temporalio/client';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { TestContext } from 'node:test';
import type { SQL } from 'drizzle-orm';

const previousTemporalAddress = process.env.TEMPORAL_ADDRESS;
const previousTemporalNamespace = process.env.TEMPORAL_NAMESPACE;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { getPostRequestMediaStateActivity } = await import('./post-request');

if (previousTemporalAddress === undefined) {
  delete process.env.TEMPORAL_ADDRESS;
} else {
  process.env.TEMPORAL_ADDRESS = previousTemporalAddress;
}
if (previousTemporalNamespace === undefined) {
  delete process.env.TEMPORAL_NAMESPACE;
} else {
  process.env.TEMPORAL_NAMESPACE = previousTemporalNamespace;
}

type MediaRow = {
  readonly id: string;
  readonly source: MediaSource;
  readonly state: MediaState;
};

const mockMediaQuery = (
  t: TestContext,
  accountId: string,
  mediaIds: readonly string[],
  getRows: () => readonly MediaRow[],
): void => {
  t.mock.method(db, 'select', () => {
    let queriedMediaIds: readonly string[] = [];
    const query = {
      from: (table: unknown) => {
        assert.equal(table, Media);
        return query;
      },
      where: (condition: unknown) => {
        const params = new PgDialect().sqlToQuery(condition as SQL).params;
        assert.ok(params.includes(accountId), 'the Media lookup is scoped to its Account');
        queriedMediaIds = params.filter(
          (value): value is string => typeof value === 'string' && mediaIds.includes(value),
        );
        assert.deepEqual(new Set(queriedMediaIds), new Set(mediaIds));
        return query;
      },
      then: (resolve: (rows: MediaRow[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(getRows().filter(({ id }) => queriedMediaIds.includes(id))).then(
          resolve,
          reject,
        ),
    };
    return query as never;
  });
};

test('post-request Media state requires the same Account Local upload and reuses READY Media', async (t) => {
  const accountId = '00000000-0000-8000-8000-000000000101';
  const mediaId = '00000000-0000-8000-8000-000000000102';
  let row: MediaRow = { id: mediaId, source: MediaSource.LOCAL, state: MediaState.READY };
  mockMediaQuery(t, accountId, [mediaId], () => [row]);

  const state = await getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] });
  assert.deepEqual(state.readyMediaIds, [mediaId]);

  row = { ...row, source: MediaSource.REMOTE };
  await assert.rejects(
    getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.type, 'PostRequestMediaInvalid');
      assert.equal(error.nonRetryable, true);
      return true;
    },
  );

  row = { ...row, source: MediaSource.LOCAL, state: 'FAILED' as MediaState };
  await assert.rejects(
    getPostRequestMediaStateActivity({ accountId, mediaIds: [mediaId] }),
    (error: unknown) =>
      error instanceof ApplicationFailure && error.type === 'PostRequestMediaInvalid',
  );
});
