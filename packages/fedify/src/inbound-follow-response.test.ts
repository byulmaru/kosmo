import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Accept, Follow, Note, Reject } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
} from '@kosmo/core/enums';
import { eq, ne } from 'drizzle-orm';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as InboundAccept from './inbound-accept';
import type * as InboundReject from './inbound-reject';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const localProfileId = '019f73b1-1111-7777-8888-123456789abc';
const localActorUri = new URL(`/ap/actor/${localProfileId}`, publicOrigin);
const remoteActorUri = new URL('https://remote.example/users/alice');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let handleInboundAccept: typeof InboundAccept.handleInboundAccept;
let handleInboundReject: typeof InboundReject.handleInboundReject;
let localInstanceId: string;

describe('inbound Accept(Follow) and Reject(Follow)', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      pg,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundAccept } = await import('./inbound-accept'));
    ({ handleInboundReject } = await import('./inbound-reject'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await pg.end();
  });

  test('promotes an exact pending request once from embedded Accept', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = createOutboundFollow(fixture.projection);
    const accept = new Accept({ actor: remoteActorUri, object: follow });
    const context = createContext(localProfileId);

    await handleInboundAccept(context, accept);
    await handleInboundAccept(context, accept);

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('uses verified actor pair fallback for non-kosmo embedded Follow', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });
    const follow = new Follow({
      actor: localActorUri,
      id: new URL(`https://foreign.example/ap/follow/${crypto.randomUUID()}`),
      object: remoteActorUri,
    });

    await handleInboundAccept(
      createContext(null),
      new Accept({ actor: remoteActorUri, object: follow }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('uses verified actor pair fallback for an embedded Follow without an id', async () => {
    const fixture = await createFixture({ projection: 'PENDING' });

    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: createOutboundFollow() }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.equal((await db.select().from(ProfileFollows)).length, 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
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

    await handleInboundAccept(context, new Accept({ actor: remoteActorUri, object }));
    await handleInboundReject(context, new Reject({ actor: remoteActorUri, object }));

    assert.deepEqual(await db.select().from(ProfileFollowRequests), [fixture.projection]);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 0, remoteFollowers: 0 });
  });

  test('keeps an exact established relation idempotently on Accept', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });

    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: createOutboundFollow(fixture.projection) }),
    );

    assert.equal((await db.select().from(ProfileFollowRequests)).length, 0);
    assert.deepEqual(await db.select().from(ProfileFollows), [fixture.projection]);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
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

  test('handles an exact Reject and ignores a stale Reject', async () => {
    const fixture = await createFixture({ projection: 'ESTABLISHED' });
    const context = createContext(localProfileId);

    await handleInboundReject(
      context,
      new Reject({
        actor: remoteActorUri,
        object: createOutboundFollow(fixture.projection),
        published: fixture.projection.createdAt.subtract({ seconds: 1 }),
      }),
    );
    assert.equal((await db.select().from(ProfileFollows)).length, 1);

    await handleInboundReject(
      context,
      new Reject({
        actor: remoteActorUri,
        object: createOutboundFollow(fixture.projection),
        published: fixture.projection.createdAt,
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
      new Accept({ actor: remoteActorUri, object: createOutboundFollow(unresponsive.projection) }),
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
    const suspended = await createFixture({
      projection: 'PENDING',
      remoteInstanceState: InstanceState.SUSPENDED,
    });
    await handleInboundAccept(
      createContext(localProfileId),
      new Accept({ actor: remoteActorUri, object: createOutboundFollow(suspended.projection) }),
    );
    assert.equal((await db.select().from(ProfileFollowRequests)).length, 1);
    assert.equal((await db.select().from(ProfileFollows)).length, 0);
  });
});

const createFixture = async ({
  projection,
  remoteInstanceState = InstanceState.ACTIVE,
}: {
  projection: 'ESTABLISHED' | 'PENDING';
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
          })
          .returning()
          .then(firstOrThrow)
      : await db
          .insert(ProfileFollowRequests)
          .values({
            followeeProfileId: remoteProfile.id,
            followerProfileId: localProfile.id,
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

const createOutboundFollow = (projection?: { readonly id: string }) =>
  new Follow({
    actor: localActorUri,
    id: projection ? new URL(`/ap/follow/${projection.id}`, publicOrigin) : null,
    object: remoteActorUri,
  });

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
