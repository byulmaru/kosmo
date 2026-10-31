import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, Media } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import {
  ApplicationFailure,
  ServiceError,
  WorkflowContinuedAsNewError,
  WorkflowFailedError,
  WorkflowNotFoundError,
} from '@temporalio/client';
import { MockActivityEnvironment } from '@temporalio/testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { TestContext } from 'node:test';
import type { SQL } from 'drizzle-orm';

const previousTemporalAddress = process.env.TEMPORAL_ADDRESS;
const previousTemporalNamespace = process.env.TEMPORAL_NAMESPACE;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const [
  { temporalClient },
  { checkPostRequestMediaUploadActivity, getPostRequestMediaStateActivity },
] = await Promise.all([import('@kosmo/core/temporal/client'), import('./post-request')]);

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

const inputFor = (accountId: string, mediaId: string) => ({ accountId, mediaId });

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

test('Post Request media check returns READY before a Temporal RPC', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000111',
    '00000000-0000-8000-8000-000000000112',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.READY },
  ]);
  t.mock.method(temporalClient.workflow, 'getHandle', () => {
    assert.fail('READY Media must not require a Temporal lookup');
  });

  await new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input);
});

test('Post Request media check marks a running upload as benign pending without awaiting its result', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000121',
    '00000000-0000-8000-8000-000000000122',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING },
  ]);
  let resultCalled = false;
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => ({ runId: 'running-run', status: { name: 'RUNNING' } }),
        result: async () => {
          resultCalled = true;
        },
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.type, 'PostRequestMediaUploadPending');
      assert.equal(error.nonRetryable, false);
      assert.equal(error.category, 'BENIGN');
      return true;
    },
  );
  assert.equal(resultCalled, false);
});

test('Post Request media check pins the closed run and confirms READY after successful completion', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000131',
    '00000000-0000-8000-8000-000000000132',
  );
  let queryCount = 0;
  mockMediaQuery(t, input.accountId, [input.mediaId], () => {
    queryCount += 1;
    return [
      {
        id: input.mediaId,
        source: MediaSource.LOCAL,
        state: queryCount === 1 ? MediaState.UPLOADING : MediaState.READY,
      },
    ];
  });
  const handleCalls: [string, string | undefined][] = [];
  let resultOptions: { readonly followRuns?: boolean } | undefined;
  t.mock.method(temporalClient.workflow, 'getHandle', ((workflowId: string, runId?: string) => {
    handleCalls.push([workflowId, runId]);
    return {
      describe: async () => ({ runId: 'closed-run', status: { name: 'COMPLETED' } }),
      result: async (options: { readonly followRuns?: boolean }) => {
        resultOptions = options;
        return {
          id: input.mediaId,
          mediaType: 'image/jpeg',
          url: 'https://media.example/image.jpg',
        };
      },
    } as never;
  }) as never);

  await new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input);

  assert.equal(queryCount, 2);
  assert.deepEqual(handleCalls, [
    [`media-upload:${input.mediaId}`, undefined],
    [`media-upload:${input.mediaId}`, 'closed-run'],
  ]);
  assert.deepEqual(resultOptions, { followRuns: false });
});

test('Post Request media check fails non-retryably when a closed upload failed', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000141',
    '00000000-0000-8000-8000-000000000142',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING },
  ]);
  const uploadCause = ApplicationFailure.nonRetryable('Processing failed', 'MediaProcessingFailed');
  const workflowFailure = new WorkflowFailedError(
    'Media upload workflow failed',
    uploadCause,
    'NON_RETRYABLE_FAILURE' as never,
  );
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => ({ runId: 'failed-run', status: { name: 'FAILED' } }),
        result: async () => {
          throw workflowFailure;
        },
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.type, 'WorkflowFailedError');
      assert.equal(error.nonRetryable, true);
      assert.equal(error.cause, workflowFailure);
      assert.equal(workflowFailure.cause, uploadCause);
      return true;
    },
  );
});

test('Post Request media check fails non-retryably when the upload workflow is missing', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000145',
    '00000000-0000-8000-8000-000000000146',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING },
  ]);
  const workflowNotFound = new WorkflowNotFoundError(
    'Media upload workflow not found',
    `media-upload:${input.mediaId}`,
    undefined,
  );
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => {
          throw workflowNotFound;
        },
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.type, 'WorkflowNotFoundError');
      assert.equal(error.nonRetryable, true);
      assert.equal(error.cause, workflowNotFound);
      return true;
    },
  );
});

test('Post Request media check rejects a completed upload that left Media UPLOADING', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000147',
    '00000000-0000-8000-8000-000000000148',
  );
  let queryCount = 0;
  mockMediaQuery(t, input.accountId, [input.mediaId], () => {
    queryCount += 1;
    return [{ id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING }];
  });
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => ({ runId: 'invalid-result-run', status: { name: 'COMPLETED' } }),
        result: async () => ({
          id: input.mediaId,
          mediaType: 'image/jpeg',
          url: 'https://media.example/image.jpg',
        }),
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'PostRequestMediaUploadInvalidResult' &&
      error.nonRetryable === true,
  );
  assert.equal(queryCount, 2);
});

test('Post Request media check marks a Continue-As-New race as pending', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000151',
    '00000000-0000-8000-8000-000000000152',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING },
  ]);
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => ({ runId: 'continued-run', status: { name: 'COMPLETED' } }),
        result: async () => {
          throw new WorkflowContinuedAsNewError('Media upload continued', 'new-run');
        },
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) =>
      error instanceof ApplicationFailure &&
      error.type === 'PostRequestMediaUploadPending' &&
      error.category === 'BENIGN',
  );
});

test('Post Request media check leaves transient Temporal RPC errors retryable', async (t) => {
  const input = inputFor(
    '00000000-0000-8000-8000-000000000161',
    '00000000-0000-8000-8000-000000000162',
  );
  mockMediaQuery(t, input.accountId, [input.mediaId], () => [
    { id: input.mediaId, source: MediaSource.LOCAL, state: MediaState.UPLOADING },
  ]);
  const serviceError = new ServiceError('Temporal service temporarily unavailable');
  t.mock.method(
    temporalClient.workflow,
    'getHandle',
    () =>
      ({
        describe: async () => {
          throw serviceError;
        },
      }) as never,
  );

  await assert.rejects(
    new MockActivityEnvironment().run(checkPostRequestMediaUploadActivity, input),
    (error: unknown) => error === serviceError,
  );
});
