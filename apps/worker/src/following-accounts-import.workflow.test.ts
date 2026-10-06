import assert from 'node:assert/strict';
import test from 'node:test';
import { db, Instances } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { remoteProfileLookupWorkflow } from '@kosmo/core/temporal/workflows';
import { federation } from '@kosmo/fedify';
import { ApplicationFailure } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { lookupRemoteActorUriActivity } from './activities/remote-profile-materialization';
import type { FollowingAccountsImportInput } from '@kosmo/core/temporal/workflows';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const followerProfileId = '00000000-0000-8000-8000-000000000101';
const remoteProfileId = '00000000-0000-8000-8000-000000000102';

test('Remote Profile lookup Activity classifies fetch errors and propagates database errors', async (t) => {
  const origin = 'https://worker-local.example';
  const previousOrigin = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = origin;
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = previousOrigin;
    }
  });

  const localInstance = {
    id: '00000000-0000-8000-8000-000000000001',
    domain: 'worker-local.example',
    kind: InstanceKind.LOCAL,
    state: InstanceState.ACTIVE,
    canonicalOrigin: origin,
  };
  let querySource: unknown;
  const state: { databaseError?: Error; instanceRows: unknown[] } = {
    instanceRows: [localInstance],
  };
  const query = {
    from: (table: unknown) => {
      querySource = table;
      return query;
    },
    innerJoin: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: () => query,
    then: (onFulfilled: (rows: unknown[]) => unknown) => {
      const rows = querySource === Instances ? state.instanceRows : [];
      return Promise.resolve(rows).then(onFulfilled);
    },
  };
  t.mock.method(db, 'select', () => {
    if (state.databaseError) {
      throw state.databaseError;
    }
    return query as never;
  });

  const fetchError = new Error('WebFinger transport unavailable');
  fetchError.name = 'FetchError';
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupWebFinger: async () => {
          throw fetchError;
        },
      }) as never,
  );

  await assert.rejects(
    lookupRemoteActorUriActivity({ domain: 'fetch-error.example', handle: 'alice' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { type?: string }).type, 'RemoteProfileFetchUnavailable');
      assert.equal((error as { nonRetryable?: boolean }).nonRetryable, false);
      assert.equal(error.cause, fetchError);
      return true;
    },
  );

  state.databaseError = new Error('Database unavailable');
  await assert.rejects(
    lookupRemoteActorUriActivity({ domain: 'database-error.example', handle: 'alice' }),
    (error: unknown) => error === state.databaseError,
  );
});

test(
  'Following Accounts Import isolates shared lookups, skips known failures, and continues bounded batches',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-following-import-test-${process.pid}`;
    const followed: string[] = [];
    const lookupCalls: string[] = [];
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity: async ({ domain, handle }) => {
          lookupCalls.push(`${handle}@${domain}`);
          if (domain === 'offline.example') {
            throw ApplicationFailure.nonRetryable(
              'Remote fetch retries were exhausted',
              'RemoteProfileFetchUnavailable',
            );
          }
          return `https://${domain}/actors/${encodeURIComponent(handle)}`;
        },
        materializeRemoteProfileActorActivity: async ({ actorUri }) => {
          if (actorUri.includes('bad-origin.example')) {
            throw ApplicationFailure.create({
              message: 'Invalid initiating Profile origin',
              type: 'RemoteActorMaterializationError',
              nonRetryable: true,
              details: ['initiator-origin'],
            });
          }
          return { needsRefresh: false, profileId: remoteProfileId };
        },
        resolveImportedLocalProfileActivity: async ({ handle }) => `local:${handle}`,
        followImportedProfileActivity: async ({ followeeProfileId }) => {
          if (followeeProfileId === 'local:blockeduser') {
            throw ApplicationFailure.nonRetryable(
              'Profile pair is blocked',
              'ProfilePairBlockedError',
            );
          }
          followed.push(followeeProfileId);
        },
      } satisfies Pick<
        typeof activities,
        | 'lookupRemoteActorUriActivity'
        | 'materializeRemoteProfileActorActivity'
        | 'resolveImportedLocalProfileActivity'
        | 'followImportedProfileActivity'
      >,
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const execute = (input: FollowingAccountsImportInput) =>
      environment.client.workflow.execute('followingAccountsImportWorkflow', {
        args: [input],
        taskQueue,
        workflowId: `following-import-test:${input.importId}`,
      });
    const importInput = (
      importId: string,
      addresses: FollowingAccountsImportInput['addresses'],
    ): FollowingAccountsImportInput => ({ importId, followerProfileId, addresses });

    await worker.runUntil(async () => {
      const sharedAddress = [
        { kind: 'remote', handle: 'Alice', domain: 'remote.example' },
      ] as const;
      const firstId = '00000000-0000-8000-8000-000000000201';
      const secondId = '00000000-0000-8000-8000-000000000202';
      await Promise.all([
        execute(importInput(firstId, sharedAddress)),
        execute(importInput(secondId, sharedAddress)),
      ]);

      assert.deepEqual(lookupCalls, ['Alice@remote.example', 'Alice@remote.example']);
      assert.deepEqual(followed, [remoteProfileId, remoteProfileId]);

      const lookupInput = {
        domain: 'remote.example',
        handle: 'Alice',
        profileId: followerProfileId,
      };
      const lookupBaseId = remoteProfileLookupWorkflow.workflowIdFromArgs(lookupInput);
      const firstLookupId = `${lookupBaseId}:following-import:${firstId}:0`;
      const secondLookupId = `${lookupBaseId}:following-import:${secondId}:0`;
      assert.notEqual(firstLookupId, secondLookupId);
      assert.equal(
        (await environment.client.workflow.getHandle(firstLookupId).describe()).workflowId,
        firstLookupId,
      );
      assert.equal(
        (await environment.client.workflow.getHandle(secondLookupId).describe()).workflowId,
        secondLookupId,
      );

      const batchId = '00000000-0000-8000-8000-000000000203';
      const batchAddresses = Array.from({ length: BATCH_SIZE_FOR_TEST }, (_, index) => ({
        kind: 'local' as const,
        handle: `user${index.toString().padStart(3, '0')}`,
      }));
      const beforeBatch = followed.length;
      await execute(importInput(batchId, batchAddresses));
      assert.equal(followed.length - beforeBatch, BATCH_SIZE_FOR_TEST);

      const skippedId = '00000000-0000-8000-8000-000000000204';
      const beforeSkipped = followed.length;
      await execute(
        importInput(skippedId, [
          { kind: 'remote', handle: 'unavailable', domain: 'offline.example' },
          { kind: 'local', handle: 'blockeduser' },
          { kind: 'local', handle: 'gooduser' },
        ]),
      );
      assert.deepEqual(followed.slice(beforeSkipped), ['local:gooduser']);

      const fatalId = '00000000-0000-8000-8000-000000000205';
      const beforeFatal = followed.length;
      await assert.rejects(
        execute(
          importInput(fatalId, [
            { kind: 'remote', handle: 'invalid', domain: 'bad-origin.example' },
            { kind: 'local', handle: 'mustnotrun' },
          ]),
        ),
      );
      assert.equal(followed.length, beforeFatal);
    });
  },
);

const BATCH_SIZE_FOR_TEST = 51;
