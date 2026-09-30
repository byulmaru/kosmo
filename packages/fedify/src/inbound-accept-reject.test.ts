import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { Accept, Follow, Note, Person, Reject, Undo } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { KosmoError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import { profileFollowRemovalWorkflowId } from '@kosmo/core/temporal/follow-command';
import { remoteProfileLookupWorkflow } from '@kosmo/core/temporal/workflows';
import { eq, ne } from 'drizzle-orm';
import { setInboundObservabilityReporter, withInboundObservability } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { RemoteProfileLookupInput } from '@kosmo/core/temporal/workflows';
import type { federation as productionFederation } from './federation';
import type * as InboundAccept from './inbound-accept';
import type * as InboundAcceptFollow from './inbound-accept-follow';
import type * as InboundFollow from './inbound-follow';
import type * as InboundReject from './inbound-reject';
import type * as Materialization from './remote-actor-materialization';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f73b1-1111-7777-8888-123456789abc';
const mastodonFixtureProjectionId = '019f73b1-2222-7777-8888-123456789abc';
const localActorUri = new URL(`/ap/actor/${localProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Notifications: typeof CoreDb.Notifications;
let pg: typeof CoreDb.pg;
let ProfileBlocks: typeof CoreDb.ProfileBlocks;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let handleInboundAccept: typeof InboundAccept.handleInboundAccept;
let handleInboundAcceptFollow: typeof InboundAcceptFollow.handleInboundAcceptFollow;
let handleInboundUndo: typeof InboundFollow.handleInboundUndo;
let handleInboundReject: typeof InboundReject.handleInboundReject;
let materializeRemoteProfileActor: typeof Materialization.materializeRemoteProfileActor;
let localInstanceId: string;

const mockRemoteProfileLookup = (lookupObject: (identifier: string | URL) => Promise<unknown>) =>
  mock.method(temporalClient.workflow, 'execute', async (workflow: unknown, options: unknown) => {
    assert.equal(workflow, remoteProfileLookupWorkflow.workflow);
    assert.ok(options && typeof options === 'object');
    const workflowOptions = options as {
      args?: readonly RemoteProfileLookupInput[];
      workflowId?: string;
    };
    const input = workflowOptions.args?.[0];
    assert.ok(input && 'actorUri' in input);
    assert.equal(workflowOptions.args?.length, 1);
    assert.equal(workflowOptions.workflowId, remoteProfileLookupWorkflow.workflowIdFromArgs(input));
    const profile = await materializeRemoteProfileActor({
      actorUri: new URL(input.actorUri),
      context: { lookupObject } as never,
    });
    return profile.id;
  });
let federation: typeof productionFederation;

describe('inbound Accept, Reject, and Undo', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      Notifications,
      pg,
      ProfileBlocks,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundAccept } = await import('./inbound-accept'));
    ({ handleInboundAcceptFollow } = await import('./inbound-accept-follow'));
    ({ handleInboundUndo } = await import('./inbound-follow'));
    ({ handleInboundReject } = await import('./inbound-reject'));
    ({ materializeRemoteProfileActor } = await import('./remote-actor-materialization'));
    ({ federation } = await import('./federation'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await waitForProfileFollowWorkflows({ terminateIdlePairs: true });
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  async function waitForProfileFollowWorkflows({ terminateIdlePairs = false } = {}) {
    const deadline = Date.now() + 30_000;

    const idleHandles: Array<ReturnType<typeof temporalClient.workflow.getHandle>> = [];

    for await (const execution of temporalClient.workflow.list({
      query:
        '(WorkflowType = "profileFollowPairWorkflow" OR WorkflowType = "profileFollowRemovalWorkflow") AND ExecutionStatus = "Running"',
    })) {
      const handle = temporalClient.workflow.getHandle(execution.workflowId, execution.runId);
      if (execution.type === 'profileFollowPairWorkflow') {
        let description = await handle.describe();
        while (
          description.status.name === 'RUNNING' &&
          ((description.raw.pendingActivities ?? []).length > 0 ||
            description.raw.pendingWorkflowTask != null)
        ) {
          if (Date.now() >= deadline) {
            throw new Error('Timed out waiting for Follow Workflow to become idle');
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
          description = await handle.describe();
        }
        if (description.status.name === 'RUNNING') {
          if (terminateIdlePairs) {
            idleHandles.push(handle);
          }
          continue;
        }
      } else if (terminateIdlePairs) {
        const description = await handle.describe();
        if (
          description.status.name === 'RUNNING' &&
          (description.raw.pendingActivities ?? []).length === 0 &&
          description.raw.pendingWorkflowTask == null
        ) {
          idleHandles.push(handle);
          continue;
        }
      }

      try {
        await handle.result();
      } catch (error) {
        if (!terminateIdlePairs) {
          throw error;
        }
        // Fixture cleanup may terminate a workflow after recording a failure.
      }
    }

    if (idleHandles.length > 0) {
      await Promise.all(
        idleHandles.map(async (handle) => {
          await handle.terminate('test fixture cleanup').catch(() => undefined);
          await handle.result().catch(() => undefined);
        }),
      );
    }
  }

  test('routes a Mastodon 4.1.18 Accept through the production Follow document boundary', async () => {
    const fixture = await createFixture({
      projection: 'PENDING',
      projectionId: mastodonFixtureProjectionId,
    });
    const acceptJson = JSON.parse(
      await readFile(
        new URL('./fixtures/mastodon-4.1.18-accept-follow.json', import.meta.url),
        'utf8',
      ),
    );
    const accept = await Accept.fromJsonLd(acceptJson);
    const loadedUrls: string[] = [];
    const documentLoader: DocumentLoader = async (url) => {
      loadedUrls.push(url);
      const response = await federation.fetch(
        new Request(url, { headers: { Accept: 'application/activity+json' } }),
        { contextData: undefined },
      );
      if (!response.ok) {
        throw new Error(`Follow document returned ${response.status}: ${url}`);
      }

      return {
        contextUrl: null,
        document: await response.json(),
        documentUrl: url,
      };
    };

    const followResponse = await federation.fetch(
      new Request(`${publicOrigin}/ap/follow/${fixture.projection.id}`, {
        headers: { Accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(followResponse.status, 200, await followResponse.text());

    await handleInboundAccept(createContext(localProfileId, documentLoader), accept);
    await handleInboundAccept(createContext(localProfileId, documentLoader), accept);

    assert.deepEqual(loadedUrls, [`${publicOrigin}/ap/follow/${fixture.projection.id}`]);
    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });

    const established = await db.select().from(ProfileFollows).then(firstOrThrow);
    const establishedFollowResponse = await federation.fetch(
      new Request(`${publicOrigin}/ap/follow/${established.id}`, {
        headers: { Accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(establishedFollowResponse.status, 200);
    const consumedRequestResponse = await federation.fetch(
      new Request(`${publicOrigin}/ap/follow/${fixture.projection.id}`, {
        headers: { Accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(consumedRequestResponse.status, 404);
    const unknownResponse = await federation.fetch(
      new Request(`${publicOrigin}/ap/follow/${crypto.randomUUID()}`, {
        headers: { Accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );
    assert.equal(unknownResponse.status, 404);
  });

  test('serves only the current available local-to-remote Follow projection', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const fetchFollow = (id: string) =>
      federation.fetch(
        new Request(`${publicOrigin}/ap/follow/${id}`, {
          headers: { Accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );

    assert.equal((await fetchFollow(fixture.projection.id.toUpperCase())).status, 404);

    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, fixture.remoteInstance.id));
    assert.equal((await fetchFollow(fixture.projection.id)).status, 404);
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, fixture.remoteInstance.id));
    assert.equal((await fetchFollow(fixture.projection.id)).status, 404);

    await db
      .update(Instances)
      .set({ state: InstanceState.ACTIVE })
      .where(eq(Instances.id, fixture.remoteInstance.id));
    await db
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, fixture.projection.id));
    const replacement = await db
      .insert(ProfileFollowRequests)
      .values({
        followeeProfileId: fixture.remoteProfile.id,
        followerProfileId: fixture.localProfile.id,
      })
      .returning()
      .then(firstOrThrow);
    assert.equal((await fetchFollow(fixture.projection.id)).status, 404);
    assert.equal((await fetchFollow(replacement.id)).status, 200);

    await db.delete(ProfileFollowRequests);
    const reversed = await db
      .insert(ProfileFollowRequests)
      .values({
        followeeProfileId: fixture.localProfile.id,
        followerProfileId: fixture.remoteProfile.id,
      })
      .returning()
      .then(firstOrThrow);
    assert.equal((await fetchFollow(reversed.id)).status, 404);
  });

  test('promotes an exact pending request once from embedded Accept', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-exact'),
        object: follow,
      }).toJsonLd(),
    );
    const loadedUrls: string[] = [];
    const documentLoader: DocumentLoader = async (url) => {
      loadedUrls.push(url);
      return {
        contextUrl: null,
        document: await follow.toJsonLd({ format: 'expand' }),
        documentUrl: url,
      };
    };
    const context = createContext(localProfileId, documentLoader);

    await handleInboundAccept(context, accept);
    await handleInboundAccept(context, accept);

    assert.deepEqual(loadedUrls, [`${publicOrigin}/ap/follow/${fixture.projection.id}`]);
    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('rejects a blocked inbound Accept without reporting an internal failure', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    await db.insert(ProfileBlocks).values({
      ownerProfileId: fixture.remoteProfile.id,
      targetProfileId: fixture.localProfile.id,
    });
    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });

    try {
      await withInboundObservability('accept', handleInboundAccept)(
        createContext(localProfileId),
        new Accept({
          actor: remoteActorUri,
          object: createOutboundFollow(fixture.projection),
        }),
      );
    } finally {
      restoreReporter();
    }

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
    assert.equal(captures.length, 0);
    assert.deepEqual(logs, [
      {
        activityType: 'Accept',
        actorOrigin: localActorUri.origin,
        handler: 'accept',
        objectOrigin: remoteActorUri.origin,
        outcome: 'rejected',
        phase: 'projection',
        reasonCode: 'accept_follow_policy_rejected',
      },
    ]);
  });

  test('concurrent pending Accepts converge on one relation through the pair Workflow', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const results = await Promise.allSettled([
      handleInboundAcceptFollow({
        context: createContext(localProfileId),
        follow,
        followeeActorUri: remoteActorUri,
        followeeProfileId: fixture.remoteProfile.id,
      }),
      handleInboundAcceptFollow({
        context: createContext(localProfileId),
        follow,
        followeeActorUri: remoteActorUri,
        followeeProfileId: fixture.remoteProfile.id,
      }),
    ]);

    assert.ok(results.some(({ status }) => status === 'fulfilled'));
    for (const result of results) {
      if (result.status === 'rejected') {
        assert.equal(
          result.reason instanceof KosmoError ? result.reason.code : undefined,
          'CONFLICT',
        );
      }
    }

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('uses verified actor pair fallback for same-origin non-kosmo embedded Follow', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = new Follow({
      actor: localActorUri,
      id: new URL(`https://remote.example/activities/follow-${crypto.randomUUID()}`),
      object: remoteActorUri,
      published: fixture.projection.createdAt,
    });
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-same-origin'),
        object: follow,
      }).toJsonLd(),
    );

    await handleInboundAccept(createContext(null), accept);

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('uses verified actor pair fallback for an embedded Follow without an id', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-without-follow-id'),
        object: createOutboundFollow(fixture.projection, { includeId: false }),
      }).toJsonLd(),
    );

    await handleInboundAccept(createContext(localProfileId), accept);

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('ignores fallback responses without the current outbound Follow generation', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const context = createContext(localProfileId);

    await handleInboundAccept(
      context,
      new Accept({
        actor: remoteActorUri,
        object: createOutboundFollow(),
      }),
    );
    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);

    const previousFollow = createOutboundFollow(fixture.projection, { includeId: false });
    await db
      .delete(ProfileFollowRequests)
      .where(eq(ProfileFollowRequests.id, fixture.projection.id));
    const replacement = await db
      .insert(ProfileFollowRequests)
      .values({
        createdAt: fixture.projection.createdAt.add({ seconds: 1 }),
        followeeProfileId: fixture.projection.followeeProfileId,
        followerProfileId: fixture.projection.followerProfileId,
      })
      .returning()
      .then(firstOrThrow);

    await handleInboundAccept(
      context,
      new Accept({
        actor: remoteActorUri,
        object: previousFollow,
      }),
    );
    await handleInboundReject(
      context,
      new Reject({
        actor: remoteActorUri,
        object: previousFollow,
        published: replacement.createdAt,
      }),
    );

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [replacement]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('ignores cross-origin embedded Follow that is not resolved from its origin', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-untrusted'),
        object: follow,
      }).toJsonLd(),
    );
    const reject = await Reject.fromJsonLd(
      await new Reject({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/reject-untrusted'),
        object: follow,
      }).toJsonLd(),
    );
    const context = createContext(localProfileId);

    await handleInboundAccept(context, accept);
    await handleInboundReject(context, reject);

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('uses Fedify to resolve an IRI-only Accept object', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const documentLoader: DocumentLoader = async (url) => ({
      contextUrl: null,
      document: await follow.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    });

    await handleInboundAccept(
      createContext(localProfileId, documentLoader),
      new Accept({
        actor: remoteActorUri,
        object: new URL(`/ap/follow/${fixture.projection.id}`, publicOrigin),
      }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('ignores IRI-only response objects that Fedify cannot resolve', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const object = new URL(`/ap/follow/${fixture.projection.id}`, publicOrigin);
    const context = createContext(localProfileId);
    const observations: { reasonCode: string }[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => observations.push(observation),
    });
    try {
      await handleInboundAccept(context, new Accept({ actor: remoteActorUri, object }));
      await handleInboundReject(context, new Reject({ actor: remoteActorUri, object }));
    } finally {
      restoreReporter();
    }

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
    assert.deepEqual(
      observations.map(({ reasonCode }) => reasonCode),
      ['accept_object_lookup_failed', 'reject_object_lookup_failed'],
    );
  });

  test('keeps an exact established relation idempotently on Accept', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-established'),
        object: createOutboundFollow(fixture.projection, { includeId: false }),
      }).toJsonLd(),
    );

    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    try {
      await handleInboundAccept(createContext(localProfileId), accept);
      await handleInboundAccept(createContext(localProfileId), accept);
    } finally {
      restoreReporter();
    }

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.deepEqual(await db.select().from(ProfileFollows), [fixture.projection]);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
    assert.deepEqual(logs, [
      {
        activityType: 'Accept',
        actorOrigin: localActorUri.origin,
        handler: 'accept',
        objectOrigin: remoteActorUri.origin,
        outcome: 'noop',
        phase: 'projection',
        reasonCode: 'duplicate_accept_noop',
      },
      {
        activityType: 'Accept',
        actorOrigin: localActorUri.origin,
        handler: 'accept',
        objectOrigin: remoteActorUri.origin,
        outcome: 'noop',
        phase: 'projection',
        reasonCode: 'duplicate_accept_noop',
      },
    ]);
  });

  test('ignores embedded non-Follow responses with a canonical Follow-shaped id', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const note = new Note({
      id: new URL(`/ap/follow/${fixture.projection.id}`, publicOrigin),
    });
    const context = createContext(localProfileId);
    const accept = await Accept.fromJsonLd(
      await new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-note'),
        object: note,
      }).toJsonLd(),
    );
    const reject = await Reject.fromJsonLd(
      await new Reject({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/reject-note'),
        object: note,
      }).toJsonLd(),
    );

    await handleInboundAccept(context, accept);
    await handleInboundReject(context, reject);

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('rejects malformed kosmo IDs and actor or recipient mismatches', async () => {
    await createFixture({ projection: 'PENDING' });
    const malformed = new Follow({
      actor: localActorUri,
      id: new URL('/ap/follow/not-a-uuid', publicOrigin),
      object: remoteActorUri,
    });
    const mismatchedActor = new Follow({
      actor: localActorUri,
      object: new URL('https://remote.example/users/mallory'),
    });

    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: malformed }),
    );
    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: mismatchedActor }),
    );
    await handleInboundAccept(
      createContext('019f73b1-9999-7777-8888-123456789abc'),
      new Accept({ actor: remoteActorUri, object: createOutboundFollow() }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 1);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('ignores Reject.published when the embedded Follow generation matches', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });
    const context = createContext(localProfileId);

    await handleInboundReject(
      context,
      new Reject({
        actor: remoteActorUri,
        object: createOutboundFollow(fixture.projection, { includeId: false }),
        published: fixture.projection.createdAt.subtract({ seconds: 1 }),
      }),
    );
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('materializes unknown actors before Accept, Reject, and Undo relation lookup', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const missingActors = [
      {
        activityUri: new URL('https://accept.example/activities/accept-1'),
        actor: new Person({
          id: new URL('https://accept.example/users/alice'),
          inbox: new URL('https://accept.example/users/alice/inbox'),
          preferredUsername: 'alice',
        }),
      },
      {
        activityUri: new URL('https://reject.example/activities/reject-1'),
        actor: new Person({
          id: new URL('https://reject.example/users/bob'),
          inbox: new URL('https://reject.example/users/bob/inbox'),
          preferredUsername: 'bob',
        }),
      },
      {
        activityUri: new URL('https://undo.example/activities/undo-1'),
        actor: new Person({
          id: new URL('https://undo.example/users/carol'),
          inbox: new URL('https://undo.example/users/carol/inbox'),
          preferredUsername: 'carol',
        }),
      },
    ];
    const actorsByUri = new Map(missingActors.map(({ actor }) => [actor.id!.href, actor]));
    const lookupObject = mock.fn(async (uri: URL) => actorsByUri.get(uri.href) ?? null);
    const lookupWorkflow = mockRemoteProfileLookup(async (identifier) =>
      lookupObject(new URL(identifier)),
    );
    const context = {
      ...createContext(localProfileId),
      lookupObject,
    } as unknown as InboxContext<void>;

    try {
      await handleInboundAccept(
        context,
        new Accept({
          actor: missingActors[0].actor.id,
          id: missingActors[0].activityUri,
          object: new Follow({
            actor: localActorUri,
            object: missingActors[0].actor.id,
          }),
        }),
        Temporal.Instant.from('2026-09-29T00:00:00Z'),
      );
      await handleInboundReject(
        context,
        new Reject({
          actor: missingActors[1].actor.id,
          id: missingActors[1].activityUri,
          object: new Follow({
            actor: localActorUri,
            object: missingActors[1].actor.id,
          }),
        }),
        Temporal.Instant.from('2026-09-29T00:00:01Z'),
      );
      await handleInboundUndo(
        context,
        new Undo({
          actor: missingActors[2].actor.id,
          id: missingActors[2].activityUri,
          object: new Follow({
            actor: missingActors[2].actor.id,
            object: localActorUri,
          }),
        }),
        Temporal.Instant.from('2026-09-29T00:00:02Z'),
      );
    } finally {
      lookupWorkflow.mock.restore();
    }

    assert.equal(lookupObject.mock.calls.length, missingActors.length);
    for (const { actor } of missingActors) {
      const stored = await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, actor.id!.href))
        .then(firstOrThrow);
      assert.equal(stored.uri, actor.id!.href);
    }
    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('consumes known Accept and Reject actor rejections while propagating lookup failures', async () => {
    const handlers = [
      {
        name: 'accept',
        dispatch: (
          context: InboxContext<void>,
          actorUri: URL,
          activityUri: URL,
          receivedAt: Temporal.Instant,
        ) =>
          handleInboundAccept(
            context,
            new Accept({
              actor: actorUri,
              id: activityUri,
              object: new Follow({ actor: localActorUri, object: actorUri }),
            }),
            receivedAt,
          ),
      },
      {
        name: 'reject',
        dispatch: (
          context: InboxContext<void>,
          actorUri: URL,
          activityUri: URL,
          receivedAt: Temporal.Instant,
        ) =>
          handleInboundReject(
            context,
            new Reject({
              actor: actorUri,
              id: activityUri,
              object: new Follow({ actor: localActorUri, object: actorUri }),
            }),
            receivedAt,
          ),
      },
    ] as const;

    for (const { dispatch, name } of handlers) {
      const invalidActorUri = new URL(`https://${name}-invalid.example/users/alice`);
      const invalidLookup = mock.fn(
        async () => new Note({ id: invalidActorUri, content: 'not an actor' }),
      );
      const invalidContext = {
        ...createContext(localProfileId),
        lookupObject: invalidLookup,
      } as unknown as InboxContext<void>;

      const invalidWorkflow = mockRemoteProfileLookup(async () => invalidLookup());
      try {
        await dispatch(
          invalidContext,
          invalidActorUri,
          new URL(`https://${name}-invalid.example/activities/response`),
          Temporal.Instant.from('2026-09-29T00:01:00Z'),
        );
      } finally {
        invalidWorkflow.mock.restore();
      }
      assert.equal(invalidLookup.mock.calls.length, 1);

      const lookupFailure = new Error(`${name} actor lookup unavailable`);
      const unavailableActorUri = new URL(`https://${name}-unavailable.example/users/alice`);
      const unavailableLookup = mock.fn(async () => {
        throw lookupFailure;
      });
      const unavailableContext = {
        ...createContext(localProfileId),
        lookupObject: unavailableLookup,
      } as unknown as InboxContext<void>;

      const unavailableWorkflow = mockRemoteProfileLookup(async () => unavailableLookup());
      try {
        await assert.rejects(
          dispatch(
            unavailableContext,
            unavailableActorUri,
            new URL(`https://${name}-unavailable.example/activities/response`),
            Temporal.Instant.from('2026-09-29T00:01:01Z'),
          ),
          (error: unknown) => error === lookupFailure,
        );
      } finally {
        unavailableWorkflow.mock.restore();
      }
      assert.equal(unavailableLookup.mock.calls.length, 1);

      const suspendedActorUri = new URL(`https://${name}-suspended.example/users/alice`);
      await db.insert(Instances).values({
        domain: `${name}-suspended.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.SUSPENDED,
      });
      const suspendedLookup = mock.fn(async () => {
        throw new Error('Suspended actor must not trigger network lookup');
      });
      const suspendedContext = {
        ...createContext(localProfileId),
        lookupObject: suspendedLookup,
      } as unknown as InboxContext<void>;
      await dispatch(
        suspendedContext,
        suspendedActorUri,
        new URL(`https://${name}-suspended.example/activities/response`),
        Temporal.Instant.from('2026-09-29T00:01:02Z'),
      );
      assert.equal(suspendedLookup.mock.calls.length, 0);
    }
  });

  test('uses receipt evidence to reactivate UNRESPONSIVE actors but ignores SUSPENDED actors', async () => {
    const unresponsive = await createFixture({
      projection: 'PENDING',
      remoteInstanceState: InstanceState.UNRESPONSIVE,
    });
    const lookupObject = mock.fn(async () => null);
    const context = {
      ...createContext(localProfileId),
      lookupObject,
    } as unknown as InboxContext<void>;
    const receivedAt = Temporal.Instant.from('2026-09-29T00:02:00Z');
    await handleInboundAccept(
      context,
      new Accept({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/accept-recovery'),
        object: createOutboundFollow(unresponsive.projection, { includeId: false }),
      }),
      receivedAt,
    );
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.equal(
      await db
        .select({ state: Instances.state })
        .from(Instances)
        .where(eq(Instances.id, unresponsive.remoteInstance.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      InstanceState.ACTIVE,
    );
    assert.equal(lookupObject.mock.calls.length, 0);

    const established = await db.select().from(ProfileFollows).then(firstOrThrow);
    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, unresponsive.remoteInstance.id));
    await handleInboundReject(
      context,
      new Reject({
        actor: remoteActorUri,
        id: new URL('https://remote.example/activities/reject-recovery'),
        object: createOutboundFollow(established),
        published: established.createdAt,
      }),
      receivedAt.add({ seconds: 1 }),
    );
    await temporalClient.workflow
      .getHandle(
        profileFollowRemovalWorkflowId({
          expectedRowId: established.id,
          followeeProfileId: established.followeeProfileId,
          followerProfileId: established.followerProfileId,
        }),
      )
      .result();
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.equal(
      await db
        .select({ state: Instances.state })
        .from(Instances)
        .where(eq(Instances.id, unresponsive.remoteInstance.id))
        .then(firstOrThrow)
        .then(({ state }) => state),
      InstanceState.ACTIVE,
    );
    assert.equal(lookupObject.mock.calls.length, 0);

    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
    await createFixture({
      projection: 'PENDING',
      remoteInstanceState: InstanceState.SUSPENDED,
    });
    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: createOutboundFollow() }),
    );
    assert.equal((await db.select().from(ProfileFollowRequests)).length, 1);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });

  test('preserves a pending request when the remote instance is suspended after Accept verification', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const loading = blockDocumentLoad(follow);
    const logs: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      log: (observation) => logs.push(observation),
    });
    const handling = handleInboundAccept(
      createContext(localProfileId, loading.documentLoader),
      new Accept({ actor: remoteActorUri, object: follow.id }),
    );

    await loading.started;
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, fixture.remoteInstance.id));
    loading.release();
    try {
      await handling;
    } finally {
      restoreReporter();
    }

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
    assert.deepEqual(logs, [
      {
        activityType: 'Accept',
        actorOrigin: localActorUri.origin,
        handler: 'accept',
        objectOrigin: remoteActorUri.origin,
        outcome: 'noop',
        phase: 'projection',
        reasonCode: 'accept_follow_state_changed_noop',
      },
    ]);
  });

  test('preserves an established relation when the remote instance is suspended after Reject verification', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });
    const follow = createOutboundFollow(fixture.projection);
    const loading = blockDocumentLoad(follow);
    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restoreReporter = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });
    const handling = handleInboundReject(
      createContext(localProfileId, loading.documentLoader),
      new Reject({
        actor: remoteActorUri,
        object: follow.id,
        published: fixture.projection.createdAt,
      }),
    );

    await loading.started;
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, fixture.remoteInstance.id));
    loading.release();
    try {
      await handling;
    } finally {
      restoreReporter();
    }

    assert.deepEqual(await db.select().from(ProfileFollows), [fixture.projection]);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
    assert.deepEqual(logs, [
      {
        activityType: 'Reject',
        actorOrigin: localActorUri.origin,
        handler: 'reject',
        objectOrigin: remoteActorUri.origin,
        outcome: 'noop',
        phase: 'projection',
        reasonCode: 'reject_follow_state_changed_noop',
      },
    ]);
    assert.equal(captures.length, 0);
  });

  test('removes a rejected Follow while cleanup is deferred', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });
    await handleInboundReject(
      createContext(localProfileId),
      new Reject({
        actor: remoteActorUri,
        object: createOutboundFollow(fixture.projection),
        published: fixture.projection.createdAt,
      }),
    );

    await temporalClient.workflow
      .getHandle(
        profileFollowRemovalWorkflowId({
          expectedRowId: fixture.projection.id,
          followeeProfileId: fixture.projection.followeeProfileId,
          followerProfileId: fixture.projection.followerProfileId,
        }),
      )
      .result();
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
    assert.equal(
      await db
        .select()
        .from(Notifications)
        .where(eq(Notifications.sourceId, fixture.projection.id))
        .then((rows) => rows.length),
      0,
    );
  });
});

const createFixture = async ({
  projection,
  projectionId,
  remoteInstanceState = InstanceState.ACTIVE,
}: {
  projection: 'ESTABLISHED' | 'PENDING';
  projectionId?: string;
  remoteInstanceState?: InstanceState;
}) => {
  const remoteInstance = await db
    .insert(Instances)
    .values({
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: remoteInstanceState,
    })
    .returning()
    .then(firstOrThrow);
  const localProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Local',
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: 'local',
      id: localProfileId,
      instanceId: localInstanceId,
      normalizedHandle: 'local',
    })
    .returning()
    .then(firstOrThrow);
  const remoteProfile = await db
    .insert(Profiles)
    .values({
      displayName: 'Alice',
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'alice',
      instanceId: remoteInstance.id,
      normalizedHandle: 'alice',
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubActors).values([
    {
      profileId: localProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: localActorUri.href,
    },
    {
      inboxUri: 'https://remote.example/users/alice/inbox',
      lastFetchedAt: Temporal.Now.instant(),
      profileId: remoteProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    },
  ]);

  const row =
    projection === 'ESTABLISHED'
      ? await db
          .insert(ProfileFollows)
          .values({
            followeeProfileId: remoteProfile.id,
            followerProfileId: localProfile.id,
            ...(projectionId ? { id: projectionId } : {}),
          })
          .returning()
          .then(firstOrThrow)
      : await db
          .insert(ProfileFollowRequests)
          .values({
            followeeProfileId: remoteProfile.id,
            followerProfileId: localProfile.id,
            ...(projectionId ? { id: projectionId } : {}),
          })
          .returning()
          .then(firstOrThrow);

  if (projection === 'ESTABLISHED') {
    await db.update(Profiles).set({ followingCount: 1 }).where(eq(Profiles.id, localProfile.id));
    await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, remoteProfile.id));
  }

  return {
    localProfile,
    projection: row,
    remoteInstance,
    remoteProfile,
  };
};

const createOutboundFollow = (
  projection?: {
    readonly createdAt: Temporal.Instant;
    readonly id: string;
  },
  { includeId = true }: { readonly includeId?: boolean } = {},
) =>
  new Follow({
    actor: localActorUri,
    id: projection && includeId ? new URL(`/ap/follow/${projection.id}`, publicOrigin) : null,
    object: remoteActorUri,
    published: projection?.createdAt,
  });

const blockDocumentLoad = (follow: Follow) => {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const documentLoader: DocumentLoader = async (url) => {
    markStarted();
    await released;
    return {
      contextUrl: null,
      document: await follow.toJsonLd({ format: 'expand' }),
      documentUrl: url,
    };
  };

  return { documentLoader, release, started };
};

const createContext = (
  recipient: string | null,
  documentLoader: DocumentLoader = async (url) => {
    throw new Error(`Unexpected document URL: ${url}`);
  },
): InboxContext<void> =>
  ({
    canonicalOrigin: publicOrigin,
    documentLoader,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    recipient,
  }) as unknown as InboxContext<void>;

const readCounts = async ({
  localProfile,
  remoteProfile,
}: {
  readonly localProfile: { readonly id: string };
  readonly remoteProfile: { readonly id: string };
}) => ({
  localFollowing: await db
    .select({ count: Profiles.followingCount })
    .from(Profiles)
    .where(eq(Profiles.id, localProfile.id))
    .then(firstOrThrow)
    .then(({ count }) => count),
  remoteFollowers: await db
    .select({ count: Profiles.followersCount })
    .from(Profiles)
    .where(eq(Profiles.id, remoteProfile.id))
    .then(firstOrThrow)
    .then(({ count }) => count),
});
