import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Accept, Follow, Note, Reject } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { KosmoError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import { profileFollowRemovalWorkflowId } from '@kosmo/core/temporal/follow-command';
import { eq, ne } from 'drizzle-orm';
import { setInboundObservabilityReporter } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { federation as productionFederation } from './federation';
import type * as InboundAccept from './inbound-accept';
import type * as InboundAcceptFollow from './inbound-accept-follow';
import type * as InboundReject from './inbound-reject';

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
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let handleInboundAccept: typeof InboundAccept.handleInboundAccept;
let handleInboundAcceptFollow: typeof InboundAcceptFollow.handleInboundAcceptFollow;
let handleInboundReject: typeof InboundReject.handleInboundReject;
let localInstanceId: string;
let federation: typeof productionFederation;

describe('inbound Accept and Reject', () => {
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
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundAccept } = await import('./inbound-accept'));
    ({ handleInboundAcceptFollow } = await import('./inbound-accept-follow'));
    ({ handleInboundReject } = await import('./inbound-reject'));
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

  test('reactivates UNRESPONSIVE but ignores SUSPENDED actors', async () => {
    const unresponsive = await createFixture({
      projection: 'PENDING',
      remoteInstanceState: InstanceState.UNRESPONSIVE,
    });
    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({
        actor: remoteActorUri,
        object: createOutboundFollow(unresponsive.projection, { includeId: false }),
      }),
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
