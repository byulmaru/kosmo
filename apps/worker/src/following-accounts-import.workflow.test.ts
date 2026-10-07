import assert from 'node:assert/strict';
import test from 'node:test';
import { db, Instances } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  followingAccountsImportWorkflow,
  remoteProfileLookupWorkflow,
} from '@kosmo/core/temporal/workflows';
import { federation } from '@kosmo/fedify';
import {
  ApplicationFailure,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { lookupRemoteActorUriActivity } from './activities/remote-profile-materialization';
import type { FollowingAccountsImportInput } from '@kosmo/core/temporal/workflows';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const followerProfileId = '00000000-0000-8000-8000-000000000101';
const otherFollowerProfileId = '00000000-0000-8000-8000-000000000103';
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
  'Following Accounts Import rejects active same-profile starts, reuses completed IDs, and continues bounded batches',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-following-import-test-${process.pid}`;
    const followed: string[] = [];
    const lookupCalls: string[] = [];
    let pauseFirstLookup = true;
    let signalFirstLookupStarted!: () => void;
    let releaseFirstLookup!: () => void;
    const firstLookupStarted = new Promise<void>((resolve) => {
      signalFirstLookupStarted = resolve;
    });
    const firstLookupGate = new Promise<void>((resolve) => {
      releaseFirstLookup = resolve;
    });
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity: async ({ domain, handle }) => {
          lookupCalls.push(`${handle}@${domain}`);
          if (pauseFirstLookup) {
            pauseFirstLookup = false;
            signalFirstLookupStarted();
            await firstLookupGate;
          }
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
            const originFailure = ApplicationFailure.create({
              message: 'Invalid initiating Profile origin',
              type: 'RemoteActorMaterializationError',
              nonRetryable: true,
              details: ['initiator-origin'],
            });
            throw ApplicationFailure.create({
              message: 'Remote account was not found',
              type: 'NotFoundError',
              nonRetryable: true,
              cause: originFailure,
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
          if (followeeProfileId === 'local:unknownfailure') {
            throw ApplicationFailure.nonRetryable('Unexpected import failure', 'UnexpectedFailure');
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

    const start = (input: FollowingAccountsImportInput) =>
      environment.client.workflow.start('followingAccountsImportWorkflow', {
        args: [input],
        taskQueue,
        workflowId: followingAccountsImportWorkflow.workflowIdFromArgs(input),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });
    const execute = async (input: FollowingAccountsImportInput) => (await start(input)).result();
    const importInput = (
      inputFollowerProfileId: string,
      addresses: FollowingAccountsImportInput['addresses'],
    ): FollowingAccountsImportInput => ({
      followerProfileId: inputFollowerProfileId,
      addresses,
    });

    await worker.runUntil(async () => {
      const sharedAddress = [
        { kind: 'remote', handle: 'Alice', domain: 'remote.example' },
      ] as const;
      const firstInput = importInput(followerProfileId, sharedAddress);
      const firstWorkflowId = followingAccountsImportWorkflow.workflowIdFromArgs(firstInput);
      const firstHandle = await start(firstInput);
      await firstLookupStarted;

      try {
        await assert.rejects(
          start(importInput(followerProfileId, sharedAddress)),
          (error: unknown) =>
            error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError',
        );
      } finally {
        releaseFirstLookup();
      }
      await firstHandle.result();

      const lookupInput = {
        domain: 'remote.example',
        handle: 'Alice',
        profileId: followerProfileId,
      };
      const firstLookupId = `${remoteProfileLookupWorkflow.workflowIdFromArgs(lookupInput)}:following-import:${firstWorkflowId}:0`;
      const firstChildRunId = (
        await environment.client.workflow.getHandle(firstLookupId).describe()
      ).runId;

      await execute(firstInput);
      assert.deepEqual(lookupCalls, ['Alice@remote.example', 'Alice@remote.example']);
      assert.deepEqual(followed, [remoteProfileId, remoteProfileId]);
      const repeatedChildRunId = (
        await environment.client.workflow.getHandle(firstLookupId).describe()
      ).runId;
      assert.notEqual(repeatedChildRunId, firstChildRunId);

      const otherInput = importInput(otherFollowerProfileId, sharedAddress);
      await Promise.all([execute(firstInput), execute(otherInput)]);
      assert.equal(lookupCalls.length, 4);
      assert.equal(followed.length, 4);

      const otherLookupId = `${remoteProfileLookupWorkflow.workflowIdFromArgs({ ...lookupInput, profileId: otherFollowerProfileId })}:following-import:${followingAccountsImportWorkflow.workflowIdFromArgs(otherInput)}:0`;
      assert.notEqual(firstLookupId, otherLookupId);
      await environment.client.workflow.getHandle(otherLookupId).describe();

      const batchAddresses = [
        ...Array.from({ length: BATCH_SIZE_FOR_TEST - 1 }, (_, index) => ({
          kind: 'local' as const,
          handle: `user${index.toString().padStart(3, '0')}`,
        })),
        { kind: 'remote' as const, handle: 'batchlast', domain: 'remote.example' },
      ];
      const batchInput = importInput(followerProfileId, batchAddresses);
      const beforeBatch = followed.length;
      await execute(batchInput);
      assert.equal(followed.length - beforeBatch, BATCH_SIZE_FOR_TEST);
      const batchLookupId = `${remoteProfileLookupWorkflow.workflowIdFromArgs({ domain: 'remote.example', handle: 'batchlast', profileId: followerProfileId })}:following-import:${followingAccountsImportWorkflow.workflowIdFromArgs(batchInput)}:50`;
      await environment.client.workflow.getHandle(batchLookupId).describe();

      const beforeSkipped = followed.length;
      await execute(
        importInput(followerProfileId, [
          { kind: 'remote', handle: 'unavailable', domain: 'offline.example' },
          { kind: 'local', handle: 'blockeduser' },
          { kind: 'local', handle: 'gooduser' },
        ]),
      );
      assert.deepEqual(followed.slice(beforeSkipped), ['local:gooduser']);

      const beforeUnknownFailure = followed.length;
      await assert.rejects(
        execute(
          importInput(followerProfileId, [
            { kind: 'local', handle: 'unknownfailure' },
            { kind: 'local', handle: 'mustnotrun' },
          ]),
        ),
      );
      assert.equal(followed.length, beforeUnknownFailure);

      const beforeFatal = followed.length;
      await assert.rejects(
        execute(
          importInput(followerProfileId, [
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
