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
import { ApplicationFailure } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { and, eq } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type {
  RemoteProfileLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/remote-profile';
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

const { REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, remoteProfileRefreshWorkflow } =
  await import('@kosmo/core/temporal/remote-profile');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof Fedify.federation;
let lookupRemoteActorUriActivity: typeof WorkerActivities.lookupRemoteActorUriActivity;
let materializeRemoteProfileActorActivity: typeof WorkerActivities.materializeRemoteProfileActorActivity;
let refreshRemoteProfileActorActivity: typeof WorkerActivities.refreshRemoteProfileActorActivity;
let seedDatabase: typeof CoreSeed.seedDatabase;
let localInstanceId: string;

before(async () => {
  ({ ActivityPubActors, db, firstOrThrow, Instances, pg, Profiles } =
    await import('@kosmo/core/db'));
  ({ seedDatabase } = await import('@kosmo/core/db/seed'));
  ({ federation } = await import('@kosmo/fedify'));
  ({
    lookupRemoteActorUriActivity,
    materializeRemoteProfileActorActivity,
    refreshRemoteProfileActorActivity,
  } = await import('./activities'));
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
    let actorLookupCalls = 0;
    const lookupWebFinger = async (resource: URL | string) => {
      assert.equal(resource, `acct:alice@${remoteDomain}`);
      return {
        links: [
          {
            href: actorUri.href,
            rel: 'self',
            type: 'application/activity+json',
          },
        ],
      };
    };
    const lookupObject = async (identifier: string | URL) => {
      actorLookupCalls += 1;
      lookups.push(identifier);
      return actor;
    };
    t.mock.method(federation, 'createContext', () => ({ lookupObject, lookupWebFinger }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileLookupInput = { domain: remoteDomain, handle: 'alice' };
    const profileId = (await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
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

    assert.equal(actorLookupCalls, 1);
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
    let actorLookupCalls = 0;
    const lookupWebFinger = async (resource: URL | string) => {
      assert.equal(resource, `acct:alice@${remoteDomain}`);
      return {
        links: [
          {
            href: actorUri.href,
            rel: 'self',
            type: 'application/activity+json',
          },
        ],
      };
    };
    const lookupObject = async (identifier: string | URL) => {
      actorLookupCalls += 1;
      lookups.push(identifier);
      if (actorLookupCalls === 1) {
        throw new Error('temporary remote lookup failure');
      }
      return actor;
    };
    t.mock.method(federation, 'createContext', () => ({ lookupObject, lookupWebFinger }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-retry-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileLookupInput = { domain: remoteDomain, handle: 'alice' };
    const profileId = (await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
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

    assert.equal(actorLookupCalls, 2);
    assert.deepEqual(lookups.map(String), [actorUri.href, actorUri.href]);
    assert.equal(profiles.length, 1);
    assert.equal(actors.length, 1);
    assert.equal(actors[0]?.uri, actor.id?.href);
  },
);

test(
  'Remote Profile Workflow는 유효한 ActivityPub self link가 없으면 non-retryable 오류로 종료한다',
  { timeout: 120_000 },
  async (t) => {
    let webFingerCalls = 0;
    let materializationCalls = 0;
    const lookupWebFinger = async (resource: URL | string) => {
      webFingerCalls += 1;
      assert.equal(resource, 'acct:invalid@invalid-remote.example');
      return {
        links: [
          {
            href: 'not-a-valid-actor-uri',
            rel: 'self',
            type: 'application/activity+json',
          },
        ],
      };
    };
    t.mock.method(federation, 'createContext', () => ({ lookupWebFinger }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-invalid-webfinger-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity: async () => {
          materializationCalls += 1;
          throw new Error('lookup failure must stop before materialization');
        },
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await assert.rejects(
      worker.runUntil(() =>
        environment.client.workflow.execute<(input: RemoteProfileLookupInput) => Promise<string>>(
          REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
          {
            args: [{ domain: 'invalid-remote.example', handle: 'invalid' }],
            taskQueue,
            workflowId: `${taskQueue}:invalid-webfinger`,
          },
        ),
      ),
      (error: unknown) => {
        const chain: unknown[] = [];
        let current: unknown = error;
        while (current && typeof current === 'object') {
          chain.push(current);
          if (!('cause' in current)) {
            break;
          }
          current = current.cause;
        }
        const failure = chain.find(
          (entry): entry is { type?: string; nonRetryable?: boolean } =>
            typeof entry === 'object' &&
            entry !== null &&
            'type' in entry &&
            entry.type === 'RemoteActorMaterializationError',
        );
        assert.ok(failure);
        assert.equal(failure.nonRetryable, true);
        assert.ok(
          chain.some(
            (entry) =>
              entry instanceof Error &&
              entry.message.includes('missing a valid ActivityPub self link'),
          ),
        );
        return true;
      },
    );

    assert.equal(webFingerCalls, 1);
    assert.equal(materializationCalls, 0);
  },
);

test(
  'Remote Profile Workflow는 suspended handle domain 대신 canonical actor URI를 따른다',
  { timeout: 120_000 },
  async (t) => {
    const handleDomain = 'suspended.remote.example';
    const actorDomain = 'canonical.remote.example';
    const actorUri = new URL(`https://${actorDomain}/users/alice`);
    await db.insert(Instances).values({
      canonicalOrigin: `https://${handleDomain}`,
      domain: handleDomain,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.SUSPENDED,
    });
    const actor = createActor({ id: actorUri });
    let actorLookupCalls = 0;
    const lookupWebFinger = async (resource: URL | string) => {
      assert.equal(resource, `acct:alice@${handleDomain}`);
      return {
        links: [
          {
            href: actorUri.href,
            rel: 'self',
            type: 'application/activity+json',
          },
        ],
      };
    };
    t.mock.method(
      federation,
      'createContext',
      () =>
        ({
          lookupObject: async (identifier: string | URL) => {
            actorLookupCalls += 1;
            assert.equal(String(identifier), actorUri.href);
            return actor;
          },
          lookupWebFinger,
        }) as never,
    );

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-rejection-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const input: RemoteProfileLookupInput = { domain: handleDomain, handle: 'alice' };
    const profileId = (await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: `${taskQueue}:canonical-actor`,
      }),
    )) as string;

    const stored = await readStoredProfile(profileId);
    assert.equal(stored.actor.uri, actorUri.href);
    assert.equal(stored.instance.domain, actorDomain);
    assert.equal(stored.instance.state, InstanceState.ACTIVE);
    assert.equal(actorLookupCalls, 1);
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

  const omittedProfileId = await refreshRemoteProfileActorActivity({
    actorUri: 'https://omitted-target.example/users/alice',
  });
  const localProfile = await createStoredProfile({
    handle: 'local-source',
    instanceId: localInstanceId,
  });
  const localProfileId = await refreshRemoteProfileActorActivity({
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
  const remoteProfileId = await refreshRemoteProfileActorActivity({
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
    refreshRemoteProfileActorActivity({
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

  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: actorUri.href }), {
    needsRefresh: false,
    profileId: profile.id,
  });
  assert.equal(lookupCalls, 0);
  assert.deepEqual(origins, []);

  const staleAt = Temporal.Now.instant().subtract({ hours: 24 * 8 });
  await db
    .update(ActivityPubActors)
    .set({ lastFetchedAt: staleAt })
    .where(eq(ActivityPubActors.profileId, profile.id));

  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: actorUri.href }), {
    needsRefresh: true,
    profileId: profile.id,
  });
  assert.equal(await refreshRemoteProfileActorActivity({ actorUri: actorUri.href }), profile.id);
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
      assert.deepEqual(await materializeRemoteProfileActorActivity(input), {
        needsRefresh: false,
        profileId: profile.id,
      });
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

  assert.equal(await refreshRemoteProfileActorActivity({ actorUri: actorUri.href }), profile.id);
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
    await refreshRemoteProfileActorActivity({ actorUri: originalActorUri.href }),
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
    refreshRemoteProfileActorActivity({ actorUri: requestedActorUri.href }),
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
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: freshUri.href }), {
    needsRefresh: false,
    profileId: freshProfile.id,
  });

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
  assert.deepEqual(
    await materializeRemoteProfileActorActivity({ actorUri: unresponsiveUri.href }),
    {
      needsRefresh: false,
      profileId: unresponsiveProfile.id,
    },
  );

  assert.equal(lookupCalls, 0);
});

test('Remote Profile state Activity는 fresh·stale·UNRESPONSIVE와 eligibility를 분류한다', async () => {
  const freshUri = 'https://state-fresh.example/users/alice';
  const freshInstance = await createInstance({ domain: 'state-fresh.example' });
  const freshProfile = await createStoredProfile({
    actorUri: freshUri,
    handle: 'fresh',
    instanceId: freshInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: freshUri }), {
    needsRefresh: false,
    profileId: freshProfile.id,
  });

  const staleUri = 'https://state-stale.example/users/alice';
  const staleInstance = await createInstance({ domain: 'state-stale.example' });
  const staleProfile = await createStoredProfile({
    actorUri: staleUri,
    handle: 'stale',
    instanceId: staleInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
  });
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: staleUri }), {
    needsRefresh: true,
    profileId: staleProfile.id,
  });

  const noFetchUri = 'https://state-never-fetched.example/users/alice';
  const noFetchInstance = await createInstance({ domain: 'state-never-fetched.example' });
  const noFetchProfile = await createStoredProfile({
    actorUri: noFetchUri,
    handle: 'never-fetched',
    instanceId: noFetchInstance.id,
    lastFetchedAt: null,
  });
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: noFetchUri }), {
    needsRefresh: true,
    profileId: noFetchProfile.id,
  });

  const unresponsiveUri = 'https://state-unresponsive.example/users/alice';
  const unresponsiveInstance = await createInstance({
    domain: 'state-unresponsive.example',
    state: InstanceState.UNRESPONSIVE,
  });
  const unresponsiveProfile = await createStoredProfile({
    actorUri: unresponsiveUri,
    handle: 'unresponsive',
    instanceId: unresponsiveInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
  });
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: unresponsiveUri }), {
    needsRefresh: false,
    profileId: unresponsiveProfile.id,
  });

  const disabledUri = 'https://state-disabled.example/users/alice';
  const disabledInstance = await createInstance({ domain: 'state-disabled.example' });
  const disabledProfile = await createStoredProfile({
    actorUri: disabledUri,
    handle: 'disabled',
    instanceId: disabledInstance.id,
  });
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, disabledProfile.id));
  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: disabledUri }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.nonRetryable, true);
      assert.equal(error.type, 'NotFoundError');
      return true;
    },
  );

  const suspendedUri = 'https://state-suspended.example/users/alice';
  const suspendedInstance = await createInstance({
    domain: 'state-suspended.example',
    state: InstanceState.SUSPENDED,
  });
  await createStoredProfile({
    actorUri: suspendedUri,
    handle: 'suspended',
    instanceId: suspendedInstance.id,
  });
  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: suspendedUri }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.nonRetryable, true);
      assert.equal(error.type, 'NotFoundError');
      return true;
    },
  );
});

test(
  'Remote Profile Workflow는 fresh와 UNRESPONSIVE Profile에서 refresh child를 시작하지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const freshUri = 'https://workflow-fresh.example/users/alice';
    const freshInstance = await createInstance({ domain: 'workflow-fresh.example' });
    const freshProfile = await createStoredProfile({
      actorUri: freshUri,
      handle: 'fresh',
      instanceId: freshInstance.id,
      lastFetchedAt: Temporal.Now.instant().subtract({ hours: 1 }),
    });
    const unresponsiveUri = 'https://workflow-unresponsive.example/users/alice';
    const unresponsiveInstance = await createInstance({
      domain: 'workflow-unresponsive.example',
      state: InstanceState.UNRESPONSIVE,
    });
    const unresponsiveProfile = await createStoredProfile({
      actorUri: unresponsiveUri,
      handle: 'unresponsive',
      instanceId: unresponsiveInstance.id,
      lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
    });
    let refreshCalls = 0;

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-fresh-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity: async () => {
          refreshCalls += 1;
          throw new Error('fresh state must not refresh');
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const execute = (domain: string, handle: string, workflowId: string) =>
        environment.client.workflow.execute<(input: RemoteProfileLookupInput) => Promise<string>>(
          REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
          {
            args: [{ domain, handle }],
            taskQueue,
            workflowId,
          },
        );

      assert.equal(
        await execute('workflow-fresh.example', 'fresh', `${taskQueue}:fresh`),
        freshProfile.id,
      );
      assert.equal(
        await execute('workflow-unresponsive.example', 'unresponsive', `${taskQueue}:unresponsive`),
        unresponsiveProfile.id,
      );
    });

    assert.equal(refreshCalls, 0);
  },
);

test(
  'Remote Profile Workflow는 stale Profile을 즉시 반환하고 refresh child와 동일한 실행을 합친다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/alice`);
    const remoteInstance = await createInstance({ domain: remoteDomain });
    const profile = await createStoredProfile({
      actorUri: actorUri.href,
      handle: 'alice',
      instanceId: remoteInstance.id,
      lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
    });
    const actor = createActor({ id: actorUri });
    let lookupCalls = 0;
    let signalLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      signalLookupStarted = resolve;
    });
    let releaseLookup!: () => void;
    const lookupReleased = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    t.mock.method(
      federation,
      'createContext',
      () =>
        ({
          lookupObject: async () => {
            lookupCalls += 1;
            signalLookupStarted();
            await lookupReleased;
            return actor;
          },
        }) as never,
    );

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-stale-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    const input: RemoteProfileLookupInput = { domain: remoteDomain, handle: 'alice' };
    const materializationInput: RemoteProfileMaterializationInput = {
      actorUri: actorUri.href,
    };
    const workflowId = `${taskQueue}:stale`;
    const execute = () =>
      environment.client.workflow.execute<(input: RemoteProfileLookupInput) => Promise<string>>(
        REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
        {
          args: [input],
          taskQueue,
          workflowId,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        },
      );

    await worker.runUntil(async () => {
      const firstResult = execute();
      const secondResult = execute();
      await lookupStarted;

      let timeout: ReturnType<typeof setTimeout> | undefined;
      let childResult: Promise<string> | undefined;
      try {
        const results = await Promise.race([
          Promise.all([firstResult, secondResult]),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('stale parent did not return before refresh')),
              10_000,
            );
          }),
        ]);
        assert.deepEqual(results, [profile.id, profile.id]);
        assert.equal(lookupCalls, 1);

        // The first parent is complete while its refresh child is still active.
        // A new parent generation must preserve the cache when the child start
        // observes that active execution instead of starting another lookup.
        assert.equal(await execute(), profile.id);
        assert.equal(lookupCalls, 1);

        const childWorkflowId =
          remoteProfileRefreshWorkflow.workflowIdFromArgs(materializationInput);
        const childHandle =
          environment.client.workflow.getHandle<
            (input: RemoteProfileMaterializationInput) => Promise<string>
          >(childWorkflowId);
        childResult = childHandle.result();
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        releaseLookup();
      }

      assert.ok(childResult);
      assert.equal(await childResult, profile.id);
      assert.equal(lookupCalls, 1);
    });
  },
);

test(
  'Remote Profile Workflow는 refresh child 실패 뒤에도 cached Profile을 유지한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/refresh-failure`);
    const remoteInstance = await createInstance({ domain: remoteDomain });
    const profile = await createStoredProfile({
      actorUri: actorUri.href,
      handle: 'refresh-failure',
      instanceId: remoteInstance.id,
      lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
    });
    const before = await readStoredProfile(profile.id);
    const refreshFailure = ApplicationFailure.nonRetryable(
      'refresh lookup failed',
      'RemoteActorMaterializationError',
    );

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-failure-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity: async () => {
          throw refreshFailure;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    const input: RemoteProfileLookupInput = {
      domain: remoteDomain,
      handle: 'refresh-failure',
    };
    const materializationInput: RemoteProfileMaterializationInput = {
      actorUri: actorUri.href,
    };

    await worker.runUntil(async () => {
      const profileId = await environment.client.workflow.execute<
        (input: RemoteProfileLookupInput) => Promise<string>
      >(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: `${taskQueue}:failure`,
      });
      assert.equal(profileId, profile.id);

      const childWorkflowId = remoteProfileRefreshWorkflow.workflowIdFromArgs(materializationInput);
      const childHandle =
        environment.client.workflow.getHandle<
          (input: RemoteProfileMaterializationInput) => Promise<string>
        >(childWorkflowId);
      await assert.rejects(childHandle.result());
    });

    const after = await readStoredProfile(profile.id);
    assert.equal(after.profile.id, before.profile.id);
    assert.equal(after.actor.lastFetchedAt?.toString(), before.actor.lastFetchedAt?.toString());
  },
);

test(
  'Remote Profile Workflow는 missing Profile의 materialization 실패를 caller에게 전달한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/missing-failure`);
    const materializationFailure = ApplicationFailure.nonRetryable(
      'missing materialization failed',
      'RemoteActorMaterializationError',
    );
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-missing-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity: async () => actorUri.href,
        materializeRemoteProfileActorActivity: async () => {
          throw materializationFailure;
        },
        refreshRemoteProfileActorActivity,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await assert.rejects(
      worker.runUntil(() =>
        environment.client.workflow.execute<(input: RemoteProfileLookupInput) => Promise<string>>(
          REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
          {
            args: [{ domain: remoteDomain, handle: 'missing-failure' }],
            taskQueue,
            workflowId: `${taskQueue}:missing-failure`,
          },
        ),
      ),
      (error: unknown) => {
        const messages: string[] = [];
        let current: unknown = error;
        while (current instanceof Error) {
          messages.push(current.message);
          current = 'cause' in current ? current.cause : undefined;
        }
        assert.ok(
          messages.some((message) => message.includes('missing materialization failed')),
          messages.join(' -> '),
        );
        return true;
      },
    );
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(ActivityPubActors), 0);
  },
);

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
