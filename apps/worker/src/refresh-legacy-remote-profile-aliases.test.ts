import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  DEFAULT_BATCH_SIZE,
  findLegacyRemoteProfileAliasPage,
  LEGACY_PROFILE_URL_CUTOFF,
  MAX_BATCH_SIZE,
  parseRefreshOptions,
  runRefreshCommand,
} from './refresh-legacy-remote-profile-aliases';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';

process.env.KOSMO_TEST_TEMPORAL_RUNTIME = '0';
await import('../../../packages/core/temporal/test-client');
const { temporalClient } = await import('@kosmo/core/temporal/client');
const { REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE, remoteProfileRefreshWorkflow } =
  await import('@kosmo/core/temporal/workflows');

const now = Temporal.Instant.from('2026-09-23T00:00:00Z');
const staleFetchedAt = Temporal.Instant.from('2026-09-01T00:00:00Z');

after(async () => {
  await pg.end();
  await temporalClient.connection.close();
});

async function createActor({
  actorUri,
  instanceKind = InstanceKind.ACTIVITYPUB,
  instanceState = InstanceState.ACTIVE,
  lastFetchedAt = staleFetchedAt,
  profileState = ProfileState.ACTIVE,
  profileUrl = null,
}: {
  readonly actorUri: string;
  readonly instanceKind?: InstanceKind;
  readonly instanceState?: InstanceState;
  readonly lastFetchedAt?: Temporal.Instant | null;
  readonly profileState?: ProfileState;
  readonly profileUrl?: string | null;
}): Promise<void> {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${suffix}.example`,
      kind: instanceKind,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: profileState,
    })
    .returning()
    .then(firstOrThrow);

  await db.insert(ActivityPubActors).values({
    lastFetchedAt,
    profileId: profile.id,
    profileUrl,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
}

test('database selection enforces the stale legacy eligibility, bound, ordering, and cursor', async (t) => {
  const namespace = randomUUID();
  const actorUri = (name: string): string => `https://actors.example/${namespace}/${name}`;
  const actorA = actorUri('a');
  const actorB = actorUri('b');
  const actorC = actorUri('c');
  await Promise.all([
    createActor({ actorUri: actorA }),
    createActor({ actorUri: actorB }),
    createActor({ actorUri: actorC }),
    createActor({
      actorUri: actorUri('recent'),
      lastFetchedAt: Temporal.Instant.from('2026-09-20T00:00:00Z'),
    }),
    createActor({
      actorUri: actorUri('has-url'),
      profileUrl: 'https://profile.example/a',
    }),
    createActor({
      actorUri: actorUri('inactive-profile'),
      profileState: ProfileState.SUSPENDED,
    }),
    createActor({
      actorUri: actorUri('unresponsive-instance'),
      instanceState: InstanceState.UNRESPONSIVE,
    }),
    createActor({ actorUri: actorUri('local'), instanceKind: InstanceKind.LOCAL }),
    createActor({ actorUri: actorUri('not-fetched'), lastFetchedAt: null }),
    createActor({
      actorUri: actorUri('cutoff'),
      lastFetchedAt: LEGACY_PROFILE_URL_CUTOFF,
    }),
  ]);

  const firstPage = await findLegacyRemoteProfileAliasPage({ limit: 2, now });
  assert.deepEqual(
    firstPage.candidates.map(({ actorUri }) => actorUri),
    [actorA, actorB],
  );
  assert.equal(firstPage.nextCursor, actorB);
  assert.equal(firstPage.ttlCutoff.toString(), '2026-09-16T00:00:00Z');

  const secondPage = await findLegacyRemoteProfileAliasPage({
    afterActorUri: firstPage.nextCursor,
    limit: 2,
    now,
  });
  assert.deepEqual(
    secondPage.candidates.map(({ actorUri }) => actorUri),
    [actorC],
  );
  assert.equal(secondPage.nextCursor, undefined);

  assert.equal(parseRefreshOptions([]).limit, DEFAULT_BATCH_SIZE);
  assert.equal(parseRefreshOptions(['--', '--limit', '2']).limit, 2);
  assert.equal(parseRefreshOptions(['--limit', String(MAX_BATCH_SIZE)]).limit, MAX_BATCH_SIZE);
  assert.throws(
    () => parseRefreshOptions(['--limit', String(MAX_BATCH_SIZE + 1)]),
    /between 1 and 100/,
  );

  const failure = { actorUri: undefined as string | undefined };
  const starts: Array<{ readonly workflow: unknown; readonly options: unknown }> = [];
  const startMock = t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflow: string | Workflow, options: WorkflowStartOptions<Workflow>) => {
      starts.push({ workflow, options });
      const workflowOptions = options as WorkflowStartOptions<
        (input: { readonly actorUri: string }) => Promise<string>
      >;
      if (workflowOptions.args?.[0]?.actorUri === failure.actorUri) {
        throw new Error('Temporal start failed');
      }
      return { workflowId: workflowOptions.workflowId } as never;
    },
  );

  const dryRun = await runRefreshCommand(parseRefreshOptions(['--limit', '2']), now);
  assert.deepEqual(
    dryRun.candidates.map(({ actorUri }) => actorUri),
    [actorA, actorB],
  );
  assert.equal(startMock.mock.callCount(), 0);

  const execution = await runRefreshCommand(
    parseRefreshOptions(['--limit', '2', '--execute']),
    now,
  );
  assert.equal(execution.candidates.length, 2);
  assert.equal(startMock.mock.callCount(), 2);
  assert.deepEqual(
    starts.map(
      ({ options }) => (options as { args: Array<{ actorUri: string }> }).args[0]?.actorUri,
    ),
    [actorA, actorB],
  );
  for (const call of starts) {
    const workflowOptions = call.options as {
      args: Array<{ actorUri: string }>;
      taskQueue: string;
      workflowId: string;
      workflowIdConflictPolicy: string;
      workflowIdReusePolicy: string;
    };
    const input = workflowOptions.args[0];

    assert.equal(call.workflow, REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE);
    assert.ok(input?.actorUri);
    assert.equal(
      workflowOptions.workflowId,
      remoteProfileRefreshWorkflow.workflowIdFromArgs(input),
    );
    assert.equal(workflowOptions.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(workflowOptions.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(workflowOptions.taskQueue, KOSMO_TASK_QUEUE);
  }

  failure.actorUri = actorB;
  await assert.rejects(
    runRefreshCommand(parseRefreshOptions(['--limit', '3', '--execute']), now),
    /Temporal start failed/,
  );
  assert.equal(startMock.mock.callCount(), 4);
});
