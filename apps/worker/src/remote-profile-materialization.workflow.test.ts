import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Endpoints, Person } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/remote-profile';
import type * as Fedify from '@kosmo/fedify';
import type * as WorkerActivities from './activities';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteDomain = 'remote.example';
const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_ORIGIN = publicOrigin;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE } =
  await import('@kosmo/core/temporal/remote-profile');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof Fedify.federation;
let materializeRemoteProfileActorActivity: typeof WorkerActivities.materializeRemoteProfileActorActivity;
let seedDatabase: typeof CoreSeed.seedDatabase;
let localInstanceId: string;

before(async () => {
  ({ ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } =
    await import('@kosmo/core/db'));
  ({ seedDatabase } = await import('@kosmo/core/db/seed'));
  ({ federation } = await import('@kosmo/fedify'));
  ({ materializeRemoteProfileActorActivity } = await import('./activities'));
});

beforeEach(async () => {
  await truncateDatabase();
  const { localInstance } = await seedDatabase({ publicOrigin });
  localInstanceId = localInstance.id;
});

after(async () => {
  await pg.end();
});

test(
  'Remote Profile Workflow가 실제 Activity를 실행해 actor와 Profile projection을 저장한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/alice`);
    const actor = createActor({ id: actorUri });
    const lookups: Array<string | URL> = [];
    let lookupCalls = 0;
    const lookupObject = async (identifier: string | URL) => {
      lookupCalls += 1;
      lookups.push(identifier);
      return actor;
    };
    t.mock.method(federation, 'createContext', () => ({ lookupObject }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-${process.pid}`;
    const worker = await Worker.create({
      activities: { materializeRemoteProfileActorActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileMaterializationInput = { actorUri: actorUri.href };
    const profileId = (await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: `${taskQueue}:success`,
      }),
    )) as string;

    const stored = await db
      .select({ actor: ActivityPubActors, instance: Instances, profile: Profiles })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Profiles.id, profileId))
      .limit(1)
      .then(firstOrThrow);

    assert.equal(lookupCalls, 1);
    assert.deepEqual(lookups.map(String), [actorUri.href]);
    assert.equal(stored.profile.id, profileId);
    assert.equal(stored.profile.state, ProfileState.ACTIVE);
    assert.equal(stored.profile.handle, 'alice');
    assert.equal(stored.profile.followPolicy, ProfileFollowPolicy.APPROVAL_REQUIRED);
    assert.equal(stored.instance.kind, InstanceKind.ACTIVITYPUB);
    assert.equal(stored.instance.domain, remoteDomain);
    assert.equal(stored.actor.type, ActivityPubActorType.PERSON);
    assert.equal(stored.actor.uri, actor.id?.href);
    assert.ok(stored.actor.lastFetchedAt);
  },
);

test(
  'Remote Profile Workflow는 일시적인 lookup 오류를 Activity retry 후 한 번의 Profile identity로 저장한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/alice`);
    const actor = createActor({ id: actorUri });
    const lookups: Array<string | URL> = [];
    let lookupCalls = 0;
    const lookupObject = async (identifier: string | URL) => {
      lookupCalls += 1;
      lookups.push(identifier);
      if (lookupCalls === 1) {
        throw new Error('temporary remote lookup failure');
      }
      return actor;
    };
    t.mock.method(federation, 'createContext', () => ({ lookupObject }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-retry-${process.pid}`;
    const worker = await Worker.create({
      activities: { materializeRemoteProfileActorActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileMaterializationInput = { actorUri: actorUri.href };
    const profileId = (await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: `${taskQueue}:retry`,
      }),
    )) as string;

    const profiles = await db.select().from(Profiles).where(eq(Profiles.id, profileId));
    const actors = await db
      .select()
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profileId));

    assert.equal(lookupCalls, 2);
    assert.deepEqual(lookups.map(String), [actorUri.href, actorUri.href]);
    assert.equal(profiles.length, 1);
    assert.equal(actors.length, 1);
    assert.equal(actors[0]?.uri, actor.id?.href);
  },
);

test(
  'Remote Profile Workflow는 unavailable instance domain rejection을 retry하지 않고 lookup하지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/alice`);
    await db.insert(Instances).values({
      canonicalOrigin: `https://${remoteDomain}`,
      domain: remoteDomain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.SUSPENDED,
    });
    let lookupCalls = 0;
    t.mock.method(
      federation,
      'createContext',
      () =>
        ({
          lookupObject: async () => {
            lookupCalls += 1;
            return createActor();
          },
        }) as never,
    );
    let activityAttempts = 0;

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-rejection-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        materializeRemoteProfileActorActivity: async (input: RemoteProfileMaterializationInput) => {
          activityAttempts += 1;
          return materializeRemoteProfileActorActivity(input);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileMaterializationInput = { actorUri: actorUri.href };
    await assert.rejects(
      worker.runUntil(() =>
        environment.client.workflow.execute(REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, {
          args: [input],
          taskQueue,
          workflowId: `${taskQueue}:rejection`,
        }),
      ),
    );

    assert.equal(activityAttempts, 1);
    assert.equal(lookupCalls, 0);
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(ActivityPubActors), 0);
  },
);

test('Remote Profile Activity는 profileId 증거에 따라 origin을 선택하고 actor metadata 결손을 거부한다', async (t) => {
  const origins: string[] = [];
  const lookupUris: Array<string | URL> = [];
  let lookupCalls = 0;
  const actorDomains = ['omitted-target.example', 'local-target.example', 'remote-target.example'];
  t.mock.method(federation, 'createContext', (origin: URL) => {
    origins.push(origin.origin);
    const actorDomain = actorDomains[origins.length - 1]!;
    return {
      lookupObject: async (identifier: string | URL) => {
        lookupCalls += 1;
        lookupUris.push(identifier);
        return createActor({ id: new URL(`https://${actorDomain}/users/alice`) });
      },
    } as never;
  });

  const omittedProfileId = await materializeRemoteProfileActorActivity({
    actorUri: 'https://omitted-target.example/users/alice',
  });
  const localProfile = await createStoredProfile({
    handle: 'local-source',
    instanceId: localInstanceId,
  });
  const localProfileId = await materializeRemoteProfileActorActivity({
    actorUri: 'https://local-target.example/users/alice',
    profileId: localProfile.id,
  });
  const sourceOrigin = 'https://origin-source.example';
  const sourceInstance = await createInstance({
    canonicalOrigin: sourceOrigin,
    domain: 'origin-source.example',
  });
  const remoteProfile = await createStoredProfile({
    actorUri: `${sourceOrigin}/users/source`,
    handle: 'remote-source',
    instanceId: sourceInstance.id,
  });
  const remoteProfileId = await materializeRemoteProfileActorActivity({
    actorUri: 'https://remote-target.example/users/alice',
    profileId: remoteProfile.id,
  });

  assert.deepEqual(origins, [publicOrigin, publicOrigin, sourceOrigin]);
  assert.deepEqual(lookupUris.map(String), [
    'https://omitted-target.example/users/alice',
    'https://local-target.example/users/alice',
    'https://remote-target.example/users/alice',
  ]);
  assert.equal(lookupCalls, 3);
  for (const profileId of [omittedProfileId, localProfileId, remoteProfileId]) {
    const stored = await readStoredProfile(profileId);
    assert.equal(stored.profile.id, profileId);
    assert.equal(stored.profile.state, ProfileState.ACTIVE);
    assert.equal(stored.instance.kind, InstanceKind.ACTIVITYPUB);
  }

  const missingMetadataInstance = await createInstance({ domain: 'missing-metadata.example' });
  const missingMetadataProfile = await createStoredProfile({
    handle: 'missing-metadata-source',
    instanceId: missingMetadataInstance.id,
  });
  const profileCount = await db.$count(Profiles);

  await assert.rejects(
    materializeRemoteProfileActorActivity({
      actorUri: 'https://missing-target.example/users/alice',
      profileId: missingMetadataProfile.id,
    }),
    (error: unknown) => {
      assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
      assert.equal((error as { type?: string }).type, 'RemoteActorMaterializationError');
      return true;
    },
  );

  assert.equal(origins.length, 3);
  assert.equal(lookupCalls, 3);
  assert.equal(await db.$count(Profiles), profileCount);
});

test('Remote Profile Activity는 fresh actor를 재조회하지 않고 stale actor만 같은 identity로 갱신한다', async (t) => {
  const origins: string[] = [];
  const actorUri = new URL(`https://${remoteDomain}/users/alice`);
  const lookups: Array<string | URL> = [];
  let lookupCalls = 0;
  t.mock.method(federation, 'createContext', (origin: URL) => {
    origins.push(origin.origin);
    return {
      lookupObject: async (identifier: string | URL) => {
        lookupCalls += 1;
        lookups.push(identifier);
        return createActor({ id: actorUri });
      },
    } as never;
  });

  const remoteInstance = await createInstance({ domain: remoteDomain });
  const profile = await createStoredProfile({
    actorUri: actorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });

  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: actorUri.href }),
    profile.id,
  );
  assert.equal(lookupCalls, 0);
  assert.deepEqual(origins, []);

  const staleAt = Temporal.Now.instant().subtract({ hours: 24 * 8 });
  await db
    .update(ActivityPubActors)
    .set({ lastFetchedAt: staleAt })
    .where(eq(ActivityPubActors.profileId, profile.id));

  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: actorUri.href }),
    profile.id,
  );
  assert.equal(lookupCalls, 1);
  assert.deepEqual(origins, [publicOrigin]);
  assert.deepEqual(lookups.map(String), [actorUri.href]);

  const stored = await readStoredProfile(profile.id);
  assert.equal(stored.profile.id, profile.id);
  assert.ok(stored.actor.lastFetchedAt);
  assert.ok(stored.actor.lastFetchedAt.epochNanoseconds > staleAt.epochNanoseconds);
});

test('Remote Profile Activity는 stale actor 실행 시 현재 Profile·Instance 상태를 다시 확인한다', async (t) => {
  const staleStateScenarios = [
    {
      apply: async (profileId: string, instanceId: string) => {
        await db
          .update(Profiles)
          .set({ state: ProfileState.DISABLED })
          .where(and(eq(Profiles.id, profileId), eq(Profiles.instanceId, instanceId)));
      },
      domain: 'disabled-profile.example',
      expected: 'reject',
      name: 'DISABLED Profile',
    },
    {
      apply: async (profileId: string, instanceId: string) => {
        await db
          .update(Profiles)
          .set({ state: ProfileState.SUSPENDED })
          .where(and(eq(Profiles.id, profileId), eq(Profiles.instanceId, instanceId)));
      },
      domain: 'suspended-profile.example',
      expected: 'reject',
      name: 'SUSPENDED Profile',
    },
    {
      apply: async (_profileId: string, instanceId: string) => {
        await db
          .update(Instances)
          .set({ state: InstanceState.SUSPENDED })
          .where(eq(Instances.id, instanceId));
      },
      domain: 'suspended-instance.example',
      expected: 'reject',
      name: 'SUSPENDED Instance',
    },
    {
      apply: async (_profileId: string, instanceId: string) => {
        await db
          .update(Instances)
          .set({ state: InstanceState.UNRESPONSIVE })
          .where(eq(Instances.id, instanceId));
      },
      domain: 'unresponsive-instance.example',
      expected: 'return',
      name: 'UNRESPONSIVE Instance',
    },
  ] as const;
  let lookupCalls = 0;
  t.mock.method(federation, 'createContext', () => {
    return {
      lookupObject: async () => {
        lookupCalls += 1;
        return createActor();
      },
    } as never;
  });

  for (const scenario of staleStateScenarios) {
    const instance = await createInstance({ domain: scenario.domain });
    const profile = await createStoredProfile({
      actorUri: `https://${scenario.domain}/users/alice`,
      handle: 'alice',
      instanceId: instance.id,
      lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
    });
    await scenario.apply(profile.id, instance.id);
    const before = await readStoredProfile(profile.id);
    const input = { actorUri: `https://${scenario.domain}/users/alice` };

    if (scenario.expected === 'return') {
      assert.equal(await materializeRemoteProfileActorActivity(input), profile.id);
    } else {
      await assert.rejects(
        materializeRemoteProfileActorActivity(input),
        (error: unknown) => {
          assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
          assert.equal((error as { type?: string }).type, 'NotFoundError');
          return true;
        },
        scenario.name,
      );
    }

    const after = await readStoredProfile(profile.id);
    assert.equal(after.profile.id, before.profile.id);
    assert.equal(after.profile.state, before.profile.state);
    assert.equal(after.instance.state, before.instance.state);
    assert.equal(after.actor.uri, before.actor.uri);
    assert.equal(after.actor.lastFetchedAt?.toString(), before.actor.lastFetchedAt?.toString());
  }

  assert.equal(lookupCalls, 0);
  assert.equal(await db.$count(Profiles), staleStateScenarios.length);
  assert.equal(await db.$count(ActivityPubActors), staleStateScenarios.length);
});

test('Remote Profile Activity는 같은 actor URI의 username 변경을 기존 Profile에 반영한다', async (t) => {
  const actorUri = new URL(`https://${remoteDomain}/users/alice`);
  const refreshedActor = createActor({
    id: actorUri,
    name: 'Renamed Alice',
    preferredUsername: 'alice_renamed',
  });
  const lookups: Array<string | URL> = [];
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async (identifier: string | URL) => {
          lookups.push(identifier);
          return refreshedActor;
        },
      }) as never,
  );

  const remoteInstance = await createInstance({ domain: remoteDomain });
  const profile = await createStoredProfile({
    actorUri: actorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  const before = await readStoredProfile(profile.id);

  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: actorUri.href }),
    profile.id,
  );
  assert.deepEqual(lookups.map(String), [actorUri.href]);

  const after = await readStoredProfile(profile.id);
  assert.equal(after.profile.id, before.profile.id);
  assert.equal(after.profile.handle, 'alice_renamed');
  assert.equal(after.profile.normalizedHandle, 'alice_renamed');
  assert.equal(after.profile.displayName, 'Renamed Alice');
  assert.equal(after.actor.uri, actorUri.href);
  assert.equal(await db.$count(Profiles), 1);
  assert.equal(await db.$count(ActivityPubActors), 1);
});

test('Remote Profile Activity는 handle 재할당 시에도 원래 actor URI를 갱신한다', async (t) => {
  const originalActorUri = new URL(`https://${remoteDomain}/users/alice`);
  const reassignedActorUri = new URL(`https://${remoteDomain}/users/reassigned`);
  const originalActor = createActor({
    id: originalActorUri,
    name: 'Renamed Alice',
    preferredUsername: 'alice_renamed',
  });
  const reassignedActor = createActor({
    id: reassignedActorUri,
    name: 'Reassigned Alice',
    preferredUsername: 'alice',
  });
  const lookups: Array<string | URL> = [];
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async (identifier: string | URL) => {
          lookups.push(identifier);
          return String(identifier) === originalActorUri.href ? originalActor : reassignedActor;
        },
      }) as never,
  );

  const remoteInstance = await createInstance({ domain: remoteDomain });
  const profile = await createStoredProfile({
    actorUri: originalActorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });

  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: originalActorUri.href }),
    profile.id,
  );
  assert.deepEqual(lookups.map(String), [originalActorUri.href]);

  const stored = await readStoredProfile(profile.id);
  assert.equal(stored.profile.id, profile.id);
  assert.equal(stored.profile.handle, 'alice_renamed');
  assert.equal(stored.actor.uri, originalActorUri.href);
  assert.equal(
    await db.$count(ActivityPubActors, eq(ActivityPubActors.uri, reassignedActorUri.href)),
    0,
  );
  assert.equal(await db.$count(Profiles), 1);
});

test('Remote Profile Activity는 lookup actor URI가 요청 URI와 다르면 저장하지 않는다', async (t) => {
  const requestedActorUri = new URL(`https://${remoteDomain}/users/alice`);
  const mismatchedActorUri = new URL(`https://${remoteDomain}/users/mismatched`);
  const mismatchedActor = createActor({
    id: mismatchedActorUri,
    name: 'Mismatched Actor',
    preferredUsername: 'alice',
  });
  const lookups: Array<string | URL> = [];
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async (identifier: string | URL) => {
          lookups.push(identifier);
          return mismatchedActor;
        },
      }) as never,
  );

  const remoteInstance = await createInstance({ domain: remoteDomain });
  const profile = await createStoredProfile({
    actorUri: requestedActorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  const before = await readStoredProfile(profile.id);

  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: requestedActorUri.href }),
    (error: unknown) => {
      assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
      assert.equal((error as { type?: string }).type, 'RemoteActorMaterializationError');
      return true;
    },
  );

  assert.deepEqual(lookups.map(String), [requestedActorUri.href]);
  const after = await readStoredProfile(profile.id);
  assert.equal(after.profile.id, before.profile.id);
  assert.equal(after.profile.handle, before.profile.handle);
  assert.equal(after.profile.displayName, before.profile.displayName);
  assert.equal(after.actor.uri, before.actor.uri);
  assert.equal(after.actor.lastFetchedAt?.toString(), before.actor.lastFetchedAt?.toString());
  assert.equal(await db.$count(Profiles), 1);
  assert.equal(await db.$count(ActivityPubActors), 1);
  assert.equal(
    await db.$count(ActivityPubActors, eq(ActivityPubActors.uri, mismatchedActorUri.href)),
    0,
  );
});

test('Remote Profile Activity는 URI 기준으로 TTL과 Profile·Instance eligibility를 다시 확인한다', async (t) => {
  let lookupCalls = 0;
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async () => {
          lookupCalls += 1;
          return createActor();
        },
      }) as never,
  );

  const freshUri = new URL('https://uri-fresh.example/users/fresh');
  const freshInstance = await createInstance({ domain: freshUri.hostname });
  const freshProfile = await createStoredProfile({
    actorUri: freshUri.href,
    handle: 'renamed-fresh',
    instanceId: freshInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: freshUri.href }),
    freshProfile.id,
  );

  const disabledUri = new URL('https://uri-disabled.example/users/alice');
  const disabledInstance = await createInstance({ domain: disabledUri.hostname });
  const disabledProfile = await createStoredProfile({
    actorUri: disabledUri.href,
    handle: 'renamed-disabled',
    instanceId: disabledInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, disabledProfile.id));
  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: disabledUri.href }),
    (error: unknown) => {
      assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
      assert.equal((error as { type?: string }).type, 'NotFoundError');
      return true;
    },
  );

  const suspendedUri = new URL('https://uri-suspended.example/users/alice');
  const suspendedInstance = await createInstance({ domain: suspendedUri.hostname });
  await createStoredProfile({
    actorUri: suspendedUri.href,
    handle: 'renamed-suspended',
    instanceId: suspendedInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, suspendedInstance.id));
  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: suspendedUri.href }),
    (error: unknown) => {
      assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
      assert.equal((error as { type?: string }).type, 'NotFoundError');
      return true;
    },
  );

  const unresponsiveUri = new URL('https://uri-unresponsive.example/users/alice');
  const unresponsiveInstance = await createInstance({ domain: unresponsiveUri.hostname });
  const unresponsiveProfile = await createStoredProfile({
    actorUri: unresponsiveUri.href,
    handle: 'renamed-unresponsive',
    instanceId: unresponsiveInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  await db
    .update(Instances)
    .set({ state: InstanceState.UNRESPONSIVE })
    .where(eq(Instances.id, unresponsiveInstance.id));
  assert.equal(
    await materializeRemoteProfileActorActivity({ actorUri: unresponsiveUri.href }),
    unresponsiveProfile.id,
  );

  assert.equal(lookupCalls, 0);
});

type PersonOptions = ConstructorParameters<typeof Person>[0];

const createActor = (overrides: Partial<PersonOptions> = {}) =>
  new Person({
    endpoints: new Endpoints({ sharedInbox: new URL(`https://${remoteDomain}/inbox`) }),
    followers: new URL(`https://${remoteDomain}/users/alice/followers`),
    following: new URL(`https://${remoteDomain}/users/alice/following`),
    id: new URL(`https://${remoteDomain}/users/alice`),
    inbox: new URL(`https://${remoteDomain}/users/alice/inbox`),
    manuallyApprovesFollowers: true,
    name: 'Alice Remote',
    outbox: new URL(`https://${remoteDomain}/users/alice/outbox`),
    preferredUsername: 'alice',
    published: Temporal.Instant.from('2024-01-02T03:04:05Z'),
    summary: 'Remote bio',
    ...overrides,
  });

const createInstance = async ({
  canonicalOrigin,
  domain,
  kind = InstanceKind.ACTIVITYPUB,
  state = InstanceState.ACTIVE,
}: {
  canonicalOrigin?: string;
  domain: string;
  kind?: InstanceKind;
  state?: InstanceState;
}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: canonicalOrigin ?? `https://${domain}`,
      domain,
      kind,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createStoredProfile = async ({
  actorUri,
  handle,
  instanceId,
  lastFetchedAt = Temporal.Now.instant(),
}: {
  actorUri?: string;
  handle: string;
  instanceId: string;
  lastFetchedAt?: Temporal.Instant | null;
}) => {
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle.toLowerCase(),
    })
    .returning()
    .then(firstOrThrow);

  if (actorUri) {
    await db
      .insert(ActivityPubActors)
      .values({
        lastFetchedAt,
        profileId: profile.id,
        type: ActivityPubActorType.PERSON,
        uri: actorUri,
      })
      .returning()
      .then(firstOrThrow);
  }

  return profile;
};

const readStoredProfile = async (profileId: string) =>
  db
    .select({ actor: ActivityPubActors, instance: Instances, profile: Profiles })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Profiles.id, profileId))
    .limit(1)
    .then(firstOrThrow);

const truncateDatabase = async () => {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(databaseName, /^kosmo_test(?:_[a-z0-9_]+)?$/);

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
};
