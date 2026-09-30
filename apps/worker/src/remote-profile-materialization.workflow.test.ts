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
  RemoteProfileUpdateInput,
} from '@kosmo/core/temporal/workflows';
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

const {
  REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
  REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE,
  remoteProfileRefreshWorkflow,
  remoteProfileLookupWorkflow,
  remoteProfileUpdateWorkflow,
} = await import('@kosmo/core/temporal/workflows');

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
let updateRemoteProfileActorActivity: typeof WorkerActivities.updateRemoteProfileActorActivity;
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
    updateRemoteProfileActorActivity,
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
  'URI lookup Workflow는 fetch null을 retry한 뒤 같은 actor를 검증해 한 Profile로 저장한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL('https://uri-workflow.example/users/alice');
    const actor = createActor({ id: actorUri, name: 'URI Alice' });
    const signer = await createStoredProfile({
      handle: 'uri-workflow-signer',
      instanceId: localInstanceId,
    });
    const lookups: Array<string | URL> = [];
    const origins: string[] = [];
    const documentLoaderIdentifiers: string[] = [];
    const documentLoaders: unknown[] = [];
    let actorLookupCalls = 0;
    t.mock.method(federation, 'createContext', (origin: URL) => {
      origins.push(origin.href);
      const documentLoader = async () => ({}) as never;
      return {
        getDocumentLoader: async ({ identifier }: { identifier: string }) => {
          documentLoaderIdentifiers.push(identifier);
          documentLoaders.push(documentLoader);
          return documentLoader;
        },
        lookupObject: async (identifier: string | URL, options?: { documentLoader?: unknown }) => {
          actorLookupCalls += 1;
          lookups.push(identifier);
          assert.equal(options?.documentLoader, documentLoader);
          return actorLookupCalls === 1 ? null : actor;
        },
      } as never;
    });

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-uri-retry-${process.pid}`;
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
    const input: RemoteProfileLookupInput = {
      actorUri: actorUri.href,
      contextOrigin: publicOrigin,
      profileId: signer.id,
    };

    const profileId = await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: remoteProfileLookupWorkflow.workflowIdFromArgs(input),
      }),
    );
    const stored = await readStoredProfile(profileId as string);

    assert.equal(actorLookupCalls, 2);
    assert.deepEqual(lookups.map(String), [actorUri.href, actorUri.href]);
    assert.deepEqual(origins, [new URL(publicOrigin).href, new URL(publicOrigin).href]);
    assert.deepEqual(documentLoaderIdentifiers, [signer.id, signer.id]);
    assert.equal(documentLoaders.length, 2);
    assert.equal(stored.actor.uri, actorUri.href);
    assert.equal(stored.profile.displayName, 'URI Alice');
    assert.equal(stored.instance.state, InstanceState.ACTIVE);
    assert.equal(await db.$count(Profiles, eq(Profiles.handle, 'alice')), 1);
    assert.equal(await db.$count(ActivityPubActors, eq(ActivityPubActors.uri, actorUri.href)), 1);
  },
);

test(
  'URI lookup Workflow rejects a different fetched Actor permanently without writes',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL('https://uri-workflow-invalid.example/users/alice');
    const mismatchedActor = createActor({
      id: new URL('https://uri-workflow-invalid.example/users/mallory'),
      name: 'Mallory',
      preferredUsername: 'alice',
    });
    let actorLookupCalls = 0;
    const origins: string[] = [];
    t.mock.method(federation, 'createContext', (origin: URL) => {
      origins.push(origin.href);
      return {
        lookupObject: async (identifier: string | URL) => {
          actorLookupCalls += 1;
          assert.equal(String(identifier), actorUri.href);
          return mismatchedActor;
        },
      } as never;
    });

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-uri-invalid-${process.pid}`;
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
    const input: RemoteProfileLookupInput = {
      actorUri: actorUri.href,
      contextOrigin: publicOrigin,
    };

    await assert.rejects(
      worker.runUntil(() =>
        environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
          args: [input],
          taskQueue,
          workflowId: remoteProfileLookupWorkflow.workflowIdFromArgs(input),
        }),
      ),
      (error: unknown) => {
        let current: unknown = error;
        let foundPermanentFailure = false;
        while (current && typeof current === 'object') {
          if (
            'nonRetryable' in current &&
            current.nonRetryable === true &&
            'type' in current &&
            current.type === 'RemoteActorMaterializationError'
          ) {
            foundPermanentFailure = true;
          }
          current = 'cause' in current ? current.cause : undefined;
        }
        assert.equal(foundPermanentFailure, true);
        return true;
      },
    );

    assert.equal(actorLookupCalls, 1);
    assert.deepEqual(origins, [new URL(publicOrigin).href]);
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(ActivityPubActors), 0);
  },
);

test(
  'Remote Profile Update Workflow는 production Activity로 기존 actor를 갱신하고 다시 활성화한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL('https://update-workflow.example/users/alice');
    const instance = await createInstance({
      domain: actorUri.hostname,
      state: InstanceState.UNRESPONSIVE,
    });
    const storedProfile = await createStoredProfile({
      actorUri: actorUri.href,
      handle: 'alice',
      instanceId: instance.id,
      lastFetchedAt: Temporal.Instant.from('2026-09-20T00:00:00Z'),
    });
    const actorJsonLd = await createActor({ id: actorUri, name: 'Updated Alice' }).toJsonLd({
      format: 'expand',
    });
    const contextOrigins: string[] = [];
    t.mock.method(federation, 'createContext', (origin: URL) => {
      contextOrigins.push(origin.href);
      return {
        lookupObject: async () => {
          throw new Error('A supplied Update actor must not be fetched');
        },
      } as never;
    });

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-update-${process.pid}`;
    const worker = await Worker.create({
      activities: { updateRemoteProfileActorActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    const input: RemoteProfileUpdateInput = {
      actorUri: actorUri.href,
      actorJsonLd,
      contextOrigin: publicOrigin,
      receipt: {
        activityUri: 'https://update-workflow.example/activities/update-1',
        receivedAt: '2026-09-29T00:00:00Z',
      },
    };

    const profileId = await worker.runUntil(() =>
      environment.client.workflow.execute(REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE, {
        args: [input],
        taskQueue,
        workflowId: remoteProfileUpdateWorkflow.workflowIdFromArgs(input),
      }),
    );
    const stored = await readStoredProfile(storedProfile.id);

    assert.equal(profileId, storedProfile.id);
    assert.deepEqual(contextOrigins, [new URL(publicOrigin).href]);
    assert.equal(stored.profile.displayName, 'Updated Alice');
    assert.equal(stored.actor.uri, actorUri.href);
    assert.equal(stored.actor.lastFetchedAt?.toString(), input.receipt.receivedAt);
    assert.equal(stored.instance.state, InstanceState.ACTIVE);
    assert.equal(await db.$count(Profiles), 1);
    assert.equal(await db.$count(ActivityPubActors), 1);
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
  'Remote Profile Workflow는 WebFinger descriptor 또는 ActivityPub self link가 없으면 null을 반환한다',
  { timeout: 120_000 },
  async (t) => {
    let webFingerCalls = 0;
    let materializationCalls = 0;
    const lookupWebFinger = async (resource: URL | string) => {
      webFingerCalls += 1;
      assert.equal(resource, 'acct:missing@missing-remote.example');
      return webFingerCalls === 1 ? null : {};
    };
    t.mock.method(federation, 'createContext', () => ({ lookupWebFinger }) as never);

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-no-match-${process.pid}`;
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

    await worker.runUntil(async () => {
      const execute = (workflowId: string) =>
        environment.client.workflow.execute<
          (input: RemoteProfileLookupInput) => Promise<string | null>
        >(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
          args: [{ domain: 'missing-remote.example', handle: 'missing' }],
          taskQueue,
          workflowId,
        });

      assert.equal(await execute(`${taskQueue}:null-descriptor`), null);
      assert.equal(await execute(`${taskQueue}:empty-links`), null);
    });

    assert.equal(webFingerCalls, 2);
    assert.equal(materializationCalls, 0);
  },
);

test(
  'Remote Profile Workflow는 malformed ActivityPub self link를 non-retryable 오류로 종료한다',
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
        environment.client.workflow.execute<
          (input: RemoteProfileLookupInput) => Promise<string | null>
        >(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
          args: [{ domain: 'invalid-remote.example', handle: 'invalid' }],
          taskQueue,
          workflowId: `${taskQueue}:invalid-webfinger`,
        }),
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
              entry instanceof Error && entry.message.includes('invalid ActivityPub self link'),
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
  const lookupDocumentLoaders: unknown[] = [];
  const documentLoaderIdentifiers: string[] = [];
  const documentLoaders: unknown[] = [];
  let lookupCalls = 0;
  const actorDomains = ['omitted-target.example', 'local-target.example', 'remote-target.example'];
  t.mock.method(federation, 'createContext', (origin: URL) => {
    origins.push(origin.origin);
    const actorDomain = actorDomains[origins.length - 1]!;
    return {
      getDocumentLoader: async ({ identifier }: { identifier: string }) => {
        documentLoaderIdentifiers.push(identifier);
        const documentLoader = async () => ({}) as never;
        documentLoaders.push(documentLoader);
        return documentLoader;
      },
      lookupObject: async (identifier: string | URL, options?: { documentLoader?: unknown }) => {
        lookupCalls += 1;
        lookupUris.push(identifier);
        lookupDocumentLoaders.push(options?.documentLoader);
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
  assert.deepEqual(documentLoaderIdentifiers, [localProfile.id]);
  assert.equal(lookupDocumentLoaders[0], undefined);
  assert.equal(lookupDocumentLoaders[1], documentLoaders[0]);
  assert.equal(lookupDocumentLoaders[2], undefined);
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
      expected: 'refresh',
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

    if (scenario.expected === 'refresh') {
      assert.deepEqual(await materializeRemoteProfileActorActivity(input), {
        needsRefresh: true,
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

  const remoteInstance = await createInstance({
    domain: remoteDomain,
    state: InstanceState.UNRESPONSIVE,
  });
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
  assert.equal(after.instance.state, InstanceState.UNRESPONSIVE);
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

test('Remote Profile Activity는 actor lookup 실패 뒤 UNRESPONSIVE를 유지한다', async (t) => {
  const actorUri = new URL(`https://${remoteDomain}/users/alice`);
  const remoteInstance = await createInstance({
    domain: remoteDomain,
    state: InstanceState.UNRESPONSIVE,
  });
  const profile = await createStoredProfile({
    actorUri: actorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 24 * 8 }),
  });
  const before = await readStoredProfile(profile.id);
  const lookupFailure = new Error('remote actor lookup failed');
  let lookupCalls = 0;
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async () => {
          lookupCalls += 1;
          throw lookupFailure;
        },
      }) as never,
  );

  await assert.rejects(
    refreshRemoteProfileActorActivity({ actorUri: actorUri.href }),
    (error: unknown) => error === lookupFailure,
  );

  const after = await readStoredProfile(profile.id);
  assert.equal(lookupCalls, 1);
  assert.equal(after.instance.state, InstanceState.UNRESPONSIVE);
  assert.equal(after.profile.state, before.profile.state);
  assert.equal(after.actor.uri, before.actor.uri);
  assert.equal(after.actor.lastFetchedAt?.toString(), before.actor.lastFetchedAt?.toString());
});

test('Remote Profile Activity는 exact actor URI 조회 성공 뒤 UNRESPONSIVE를 복구한다', async (t) => {
  const actorUri = new URL(`https://${remoteDomain}/users/alice`);
  const remoteInstance = await createInstance({
    domain: remoteDomain,
    state: InstanceState.UNRESPONSIVE,
  });
  const staleAt = Temporal.Now.instant().subtract({ hours: 24 * 8 });
  const profile = await createStoredProfile({
    actorUri: actorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: staleAt,
  });
  const lookups: Array<string | URL> = [];
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async (identifier: string | URL) => {
          lookups.push(identifier);
          return createActor({ id: actorUri, name: 'Recovered Alice' });
        },
      }) as never,
  );

  assert.equal(await refreshRemoteProfileActorActivity({ actorUri: actorUri.href }), profile.id);

  const recovered = await readStoredProfile(profile.id);
  assert.deepEqual(lookups.map(String), [actorUri.href]);
  assert.equal(recovered.instance.state, InstanceState.ACTIVE);
  assert.equal(recovered.profile.displayName, 'Recovered Alice');
  assert.ok(recovered.actor.lastFetchedAt);
  assert.ok(recovered.actor.lastFetchedAt.epochNanoseconds > staleAt.epochNanoseconds);
});

test('Actor receipt만 UNRESPONSIVE actor를 복구하고 stale TTL을 유지한다', async (t) => {
  let contextCalls = 0;
  t.mock.method(federation, 'createContext', () => {
    contextCalls += 1;
    throw new Error('Stored actor paths must not fetch');
  });

  const cachedUri = 'https://stored-cached.example/users/alice';
  const cachedInstance = await createInstance({
    domain: 'stored-cached.example',
    state: InstanceState.UNRESPONSIVE,
  });
  const cachedProfile = await createStoredProfile({
    actorUri: cachedUri,
    handle: 'cached',
    instanceId: cachedInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 1 }),
  });
  const cached = await materializeRemoteProfileActorActivity({
    actorUri: cachedUri,
  });
  assert.equal(cached?.profileId, cachedProfile.id);
  assert.equal(
    (await readStoredProfile(cachedProfile.id)).instance.state,
    InstanceState.UNRESPONSIVE,
  );

  const receivedUri = 'https://stored-received.example/users/alice';
  const receivedInstance = await createInstance({
    domain: 'stored-received.example',
    state: InstanceState.UNRESPONSIVE,
  });
  const receivedProfile = await createStoredProfile({
    actorUri: receivedUri,
    handle: 'received',
    instanceId: receivedInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
  });
  const received = await materializeRemoteProfileActorActivity({
    actorUri: receivedUri,
    receipt: {
      activityUri: 'https://stored-received.example/activities/follow-1',
      receivedAt: '2026-09-28T23:59:00Z',
    },
  });
  assert.deepEqual(received, { needsRefresh: true, profileId: receivedProfile.id });
  assert.equal((await readStoredProfile(receivedProfile.id)).instance.state, InstanceState.ACTIVE);

  assert.equal(
    await materializeRemoteProfileActorActivity({
      actorUri: 'https://stored-missing.example/users/alice',
    }),
    null,
  );
  assert.equal(contextCalls, 0);
});

test('Actor receipt cannot bypass DISABLED Profile or SUSPENDED Instance eligibility', async () => {
  const disabledUri = 'https://stored-disabled.example/users/alice';
  const disabledInstance = await createInstance({ domain: 'stored-disabled.example' });
  const disabledProfile = await createStoredProfile({
    actorUri: disabledUri,
    handle: 'disabled',
    instanceId: disabledInstance.id,
  });
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, disabledProfile.id));

  const suspendedUri = 'https://stored-suspended.example/users/alice';
  const suspendedInstance = await createInstance({
    domain: 'stored-suspended.example',
    state: InstanceState.SUSPENDED,
  });
  const suspendedProfile = await createStoredProfile({
    actorUri: suspendedUri,
    handle: 'suspended',
    instanceId: suspendedInstance.id,
  });

  for (const actorUri of [disabledUri, suspendedUri]) {
    await assert.rejects(
      materializeRemoteProfileActorActivity({
        actorUri,
        receipt: { receivedAt: '2026-09-29T00:00:00Z' },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApplicationFailure);
        assert.equal(error.nonRetryable, true);
        assert.equal(error.type, 'NotFoundError');
        return true;
      },
    );
  }

  assert.equal((await readStoredProfile(disabledProfile.id)).profile.state, ProfileState.DISABLED);
  assert.equal(
    (await readStoredProfile(suspendedProfile.id)).instance.state,
    InstanceState.SUSPENDED,
  );
});

test('No-document lookup rejects missing targets on SUSPENDED and local Instances', async () => {
  const suspendedActorUri = 'https://suspended-missing.example/users/alice';
  await createInstance({ domain: 'suspended-missing.example', state: InstanceState.SUSPENDED });

  await assert.rejects(
    materializeRemoteProfileActorActivity({ actorUri: suspendedActorUri }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.nonRetryable, true);
      assert.equal(error.type, 'NotFoundError');
      return true;
    },
  );

  await assert.rejects(
    materializeRemoteProfileActorActivity({
      actorUri: `${publicOrigin}/ap/actor/missing`,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.nonRetryable, true);
      assert.equal(error.type, 'ConflictError');
      return true;
    },
  );
});

test('Remote Profile Update는 저장된 actor가 없으면 network 없이 null을 반환한다', async (t) => {
  const actorUri = new URL(`https://${remoteDomain}/users/missing-update`);
  const actor = createActor({ id: actorUri });
  const actorJsonLd = await actor.toJsonLd({ format: 'expand' });
  let contextCalls = 0;
  t.mock.method(federation, 'createContext', () => {
    contextCalls += 1;
    throw new Error('A missing Update actor must not create a Fedify context');
  });

  assert.equal(
    await updateRemoteProfileActorActivity({
      actorUri: actorUri.href,
      actorJsonLd,
      contextOrigin: publicOrigin,
      receipt: {
        activityUri: 'https://remote.example/activities/update-missing',
        receivedAt: '2026-09-29T00:00:00Z',
      },
    }),
    null,
  );

  assert.equal(contextCalls, 0);
  assert.equal(await db.$count(Profiles), 0);
  assert.equal(await db.$count(ActivityPubActors), 0);
});

test('Remote Profile Update projection URI mismatch는 non-retryable 오류로 남고 저장 상태를 보존한다', async (t) => {
  const actorUri = new URL(`https://${remoteDomain}/users/alice`);
  const mismatchedActorUri = new URL(`https://${remoteDomain}/users/mallory`);
  const remoteInstance = await createInstance({
    domain: remoteDomain,
    state: InstanceState.UNRESPONSIVE,
  });
  const profile = await createStoredProfile({
    actorUri: actorUri.href,
    handle: 'alice',
    instanceId: remoteInstance.id,
    lastFetchedAt: Temporal.Now.instant().subtract({ hours: 8 * 24 }),
  });
  const before = await readStoredProfile(profile.id);
  const mismatchedActor = createActor({ id: mismatchedActorUri, name: 'Mallory' });
  const actorJsonLd = await mismatchedActor.toJsonLd({ format: 'expand' });
  let lookupCalls = 0;
  t.mock.method(
    federation,
    'createContext',
    () =>
      ({
        lookupObject: async () => {
          lookupCalls += 1;
          throw new Error('A supplied Update document must not be fetched');
        },
      }) as never,
  );

  await assert.rejects(
    updateRemoteProfileActorActivity({
      actorUri: actorUri.href,
      actorJsonLd,
      contextOrigin: publicOrigin,
      receipt: {
        activityUri: 'https://remote.example/activities/update-1',
        receivedAt: '2026-09-29T00:00:00Z',
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure);
      assert.equal(error.nonRetryable, true);
      assert.equal(error.type, 'RemoteActorMaterializationError');
      return true;
    },
  );

  const after = await readStoredProfile(profile.id);
  assert.equal(after.instance.state, InstanceState.UNRESPONSIVE);
  assert.equal(after.profile.handle, before.profile.handle);
  assert.equal(after.profile.displayName, before.profile.displayName);
  assert.equal(after.actor.uri, before.actor.uri);
  assert.equal(after.actor.lastFetchedAt?.toString(), before.actor.lastFetchedAt?.toString());
  assert.equal(lookupCalls, 0);
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
      needsRefresh: true,
      profileId: unresponsiveProfile.id,
    },
  );

  assert.equal(lookupCalls, 0);
});

test('Remote Profile state Activity는 7일 TTL과 UNRESPONSIVE·eligibility를 분류한다', async (t) => {
  const now = Temporal.Instant.from('2026-09-29T00:00:00Z');
  t.mock.method(Temporal.Now, 'instant', () => now);

  const freshUri = 'https://state-fresh.example/users/alice';
  const freshInstance = await createInstance({ domain: 'state-fresh.example' });
  const freshProfile = await createStoredProfile({
    actorUri: freshUri,
    handle: 'fresh',
    instanceId: freshInstance.id,
    lastFetchedAt: now.subtract({ hours: 7 * 24 }).add({ nanoseconds: 1_000 }),
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
    lastFetchedAt: now.subtract({ hours: 7 * 24 }),
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
    lastFetchedAt: now.subtract({ hours: 8 * 24 }),
  });
  assert.deepEqual(await materializeRemoteProfileActorActivity({ actorUri: unresponsiveUri }), {
    needsRefresh: true,
    profileId: unresponsiveProfile.id,
  });

  const freshUnresponsiveUri = 'https://state-fresh-unresponsive.example/users/alice';
  const freshUnresponsiveInstance = await createInstance({
    domain: 'state-fresh-unresponsive.example',
    state: InstanceState.UNRESPONSIVE,
  });
  const freshUnresponsiveProfile = await createStoredProfile({
    actorUri: freshUnresponsiveUri,
    handle: 'fresh-unresponsive',
    instanceId: freshUnresponsiveInstance.id,
    lastFetchedAt: now.subtract({ hours: 1 }),
  });
  assert.deepEqual(
    await materializeRemoteProfileActorActivity({ actorUri: freshUnresponsiveUri }),
    { needsRefresh: false, profileId: freshUnresponsiveProfile.id },
  );

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
  'Remote Profile Workflow는 stale UNRESPONSIVE Profile을 즉시 반환하고 refresh child를 시작한다',
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
    let markRefreshComplete!: () => void;
    const refreshCompleted = new Promise<void>((resolve) => {
      markRefreshComplete = resolve;
    });

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-fresh-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity: async (input: RemoteProfileMaterializationInput) => {
          const { actorUri } = input;
          refreshCalls += 1;
          assert.equal(actorUri, unresponsiveUri);
          markRefreshComplete();
          return unresponsiveProfile.id;
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
      await refreshCompleted;
    });

    assert.equal(refreshCalls, 1);
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
  'Remote Profile Workflow는 missing actor refresh 실패를 caller에게 전달한다',
  { timeout: 120_000 },
  async (t) => {
    const actorUri = new URL(`https://${remoteDomain}/users/missing-failure`);
    const refreshFailure = ApplicationFailure.nonRetryable(
      'missing actor refresh failed',
      'RemoteActorMaterializationError',
    );
    let refreshCalls = 0;
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-missing-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity: async () => actorUri.href,
        materializeRemoteProfileActorActivity,
        refreshRemoteProfileActorActivity: async () => {
          refreshCalls += 1;
          throw refreshFailure;
        },
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
          messages.some((message) => message.includes('missing actor refresh failed')),
          messages.join(' -> '),
        );
        return true;
      },
    );
    assert.equal(refreshCalls, 1);
    assert.equal(await db.$count(Profiles), 0);
    assert.equal(await db.$count(ActivityPubActors), 0);
  },
);

test(
  'Remote Profile lookup과 Update Workflow는 malformed 입력을 Activity 전에 non-retryable로 거부한다',
  { timeout: 120_000 },
  async (t) => {
    let lookupActivityCalls = 0;
    let updateActivityCalls = 0;
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-remote-profile-materialization-invalid-input-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        lookupRemoteActorUriActivity: async () => {
          lookupActivityCalls += 1;
          return null;
        },
        materializeRemoteProfileActorActivity: async () => {
          lookupActivityCalls += 1;
          return null;
        },
        refreshRemoteProfileActorActivity: async () => {
          lookupActivityCalls += 1;
          return '';
        },
        updateRemoteProfileActorActivity: async () => {
          updateActivityCalls += 1;
          return null;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });
    const invalidLookupInputs = [
      { actorUri: 'ftp://remote.example/users/alice' },
      {
        actorUri: 'https://remote.example/users/alice',
        actorDocument: {
          jsonLd: { id: 'https://remote.example/users/alice', type: 'Person' },
          contextOrigin: publicOrigin,
          receivedAt: '2026-09-29T00:00:00Z',
        },
      },
    ] as unknown as RemoteProfileLookupInput[];

    const assertNonRetryable = (promise: Promise<unknown>) =>
      assert.rejects(promise, (error: unknown) => {
        let current: unknown = error;
        let foundNonRetryableFailure = false;
        while (current && typeof current === 'object') {
          if ('nonRetryable' in current && current.nonRetryable === true) {
            foundNonRetryableFailure = true;
          }
          current = 'cause' in current ? current.cause : undefined;
        }
        assert.equal(foundNonRetryableFailure, true);
        return true;
      });

    await worker.runUntil(async () => {
      for (const [index, input] of invalidLookupInputs.entries()) {
        await assertNonRetryable(
          environment.client.workflow.execute(REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE, {
            args: [input],
            taskQueue,
            workflowId: `${taskQueue}:invalid-lookup-input:${index}`,
          }),
        );
      }
      assert.equal(lookupActivityCalls, 0);

      const invalidUpdate = {
        actorUri: 'https://remote.example/users/alice',
        actorJsonLd: { id: 'https://remote.example/users/alice', type: 'Person' },
        contextOrigin: publicOrigin,
        receipt: { receivedAt: '2026-09-29T00:00:00Z' },
        unexpected: true,
      } as RemoteProfileUpdateInput;
      await assertNonRetryable(
        environment.client.workflow.execute(REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE, {
          args: [invalidUpdate],
          taskQueue,
          workflowId: `${taskQueue}:invalid-update-input`,
        }),
      );
      assert.equal(updateActivityCalls, 0);
    });
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
