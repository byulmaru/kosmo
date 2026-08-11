import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { Accept, Endpoints, Follow, Image, Note, Person, Update } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileMediaKind,
} from '@kosmo/core/enums';
import { and, eq, inArray } from 'drizzle-orm';
import { createFedifyContextData as createFedifyContextDataWithDatabase } from './fedify-context';
import { setInboundObservabilityReporter } from './inbound-observability';
import type { DocumentLoader, InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type { FedifyContextData } from './fedify-context';
import type { handleInboundAccept as HandleInboundAccept } from './inbound-accept';
import type { handleInboundUpdate as HandleInboundUpdate } from './inbound-update';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteActorUri = new URL('https://remote.example/users/alice');
const firstLocalProfileId = '019f7abc-1111-7777-8888-123456789abc';
const secondLocalProfileId = '019f7abc-2222-7777-8888-123456789abc';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
const createFedifyContextData = () => createFedifyContextDataWithDatabase(db);
let first: typeof CoreDb.first;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfileMedia: typeof CoreDb.ProfileMedia;
let Profiles: typeof CoreDb.Profiles;
let followProfile: typeof CoreServices.followProfile;
let handleInboundAccept: typeof HandleInboundAccept;
let handleInboundUpdate: typeof HandleInboundUpdate;
let localInstanceId: string;

describe('inbound actor Update', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      db,
      first,
      firstOrThrow,
      Instances,
      Media,
      pg,
      ProfileFollowRequests,
      ProfileFollows,
      ProfileMedia,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ followProfile } = await import('@kosmo/core/services'));
    ({ handleInboundAccept } = await import('./inbound-accept'));
    ({ handleInboundUpdate } = await import('./inbound-update'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await cleanFixtures();
    mock.restoreAll();
  });

  afterEach(async () => {
    await cleanFixtures();
  });

  after(async () => {
    await pg.end();
  });

  test('refreshes profile projection and endpoint metadata in both policy directions', async () => {
    const fixture = await createRemoteActor(ProfileFollowPolicy.OPEN);
    const firstReceivedAt = Temporal.Instant.from('2026-07-31T05:00:00Z');
    const context = createContext();
    const approvalRequired = createActor({
      icon: new Image({
        mediaType: 'image/png',
        name: 'Updated avatar',
        url: new URL('https://remote.example/media/avatar.png'),
      }),
      image: new Image({
        mediaType: 'image/webp',
        name: 'Updated header',
        url: new URL('https://remote.example/media/header.webp'),
      }),
      manuallyApprovesFollowers: true,
      name: 'Alice Updated',
      summary: '<p>Updated <strong>bio</strong></p>',
    });

    await handleInboundUpdate(
      context,
      new Update({ actor: remoteActorUri, object: approvalRequired }),
      firstReceivedAt,
    );

    let stored = await readRemoteActor(fixture.profile.id);
    assert.equal(stored.profile.displayName, 'Alice Updated');
    assert.equal(stored.profile.bio, 'Updated bio');
    assert.equal(stored.profile.followPolicy, ProfileFollowPolicy.APPROVAL_REQUIRED);
    assert.equal(stored.actor.inboxUri, 'https://remote.example/users/alice/inbox-updated');
    assert.equal(stored.actor.sharedInboxUri, 'https://remote.example/inbox-updated');
    assert.equal(stored.actor.lastFetchedAt?.toString(), firstReceivedAt.toString());
    assert.deepEqual(await readProfileMedia(fixture.profile.id), [
      {
        altText: 'Updated avatar',
        kind: ProfileMediaKind.AVATAR,
        url: 'https://remote.example/media/avatar.png',
      },
      {
        altText: 'Updated header',
        kind: ProfileMediaKind.HEADER,
        url: 'https://remote.example/media/header.webp',
      },
    ]);

    const secondReceivedAt = firstReceivedAt.add({ seconds: 1 });
    await handleInboundUpdate(
      context,
      new Update({
        actor: remoteActorUri,
        object: createActor({ manuallyApprovesFollowers: false }),
      }),
      secondReceivedAt,
    );

    stored = await readRemoteActor(fixture.profile.id);
    assert.equal(stored.profile.followPolicy, ProfileFollowPolicy.OPEN);
    assert.equal(stored.actor.lastFetchedAt?.toString(), secondReceivedAt.toString());
    assert.deepEqual(await readProfileMedia(fixture.profile.id), []);
    assert.equal(await db.$count(Media, eq(Media.profileId, fixture.profile.id)), 2);
  });

  test('ignores mismatched, unsupported, unknown, and local actor updates without document loading', async () => {
    const fixture = await createRemoteActor(ProfileFollowPolicy.OPEN);
    const localProfile = await createLocalActor(firstLocalProfileId, 'update-local-collision');
    const before = await readRemoteActor(fixture.profile.id);
    const documentLoader = mock.fn(async () => {
      throw new Error('inbox document loader must not run');
    });
    const context = createContext(null, documentLoader);
    const otherActorUri = new URL('https://remote.example/users/mallory');
    const unknownActorUri = new URL('https://unknown.example/users/alice');
    const localActorUri = new URL(`/ap/actor/${firstLocalProfileId}`, publicOrigin);

    const rejected = [
      new Update({ actor: remoteActorUri, object: createActor({ id: otherActorUri }) }),
      new Update({ actor: remoteActorUri, object: new Note({ id: remoteActorUri }) }),
      new Update({ actor: unknownActorUri, object: createActor({ id: unknownActorUri }) }),
      new Update({
        actor: localActorUri,
        object: createActor({ id: localActorUri, preferredUsername: 'local' }),
      }),
      new Update({
        actors: [remoteActorUri, otherActorUri],
        object: createActor(),
      }),
    ];

    for (const update of rejected) {
      await handleInboundUpdate(context, update);
    }

    assert.deepEqual(await readRemoteActor(fixture.profile.id), before);
    assert.equal(
      await db
        .select({ displayName: Profiles.displayName })
        .from(Profiles)
        .where(eq(Profiles.id, localProfile.id))
        .then(firstOrThrow)
        .then(({ displayName }) => displayName),
      'update-local-collision',
    );
    assert.equal(documentLoader.mock.calls.length, 0);
    assert.equal(
      await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.uri, unknownActorUri.href))
        .then((rows) => rows.length),
      0,
    );
  });

  test('logs a failed Update object lookup once and returns', async () => {
    await createRemoteActor(ProfileFollowPolicy.OPEN);
    const logs: unknown[] = [];
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });

    try {
      await handleInboundUpdate(
        createContext(),
        new Update({ actor: remoteActorUri, object: remoteActorUri }),
      );

      assert.equal(captures.length, 0);
      assert.deepEqual(logs, [
        {
          activityType: 'Update',
          actorOrigin: remoteActorUri.origin,
          handler: 'update',
          objectOrigin: remoteActorUri.origin,
          outcome: 'external_failure',
          phase: 'object_lookup',
          reasonCode: 'update_object_lookup_failed',
        },
      ]);
    } finally {
      restore();
    }
  });

  test('processes a duplicate update idempotently', async () => {
    const fixture = await createRemoteActor(ProfileFollowPolicy.OPEN);
    const receivedAt = Temporal.Instant.from('2026-07-31T05:00:00Z');
    const update = new Update({
      actor: remoteActorUri,
      id: new URL('https://remote.example/activities/update-1'),
      object: createActor({ manuallyApprovesFollowers: true }),
    });

    await handleInboundUpdate(createContext(), update, receivedAt);
    await handleInboundUpdate(createContext(), update, receivedAt);

    const stored = await readRemoteActor(fixture.profile.id);
    assert.equal(stored.profile.followPolicy, ProfileFollowPolicy.APPROVAL_REQUIRED);
    assert.equal(stored.actor.lastFetchedAt?.toString(), receivedAt.toString());
    assert.equal(
      await countPair(ProfileFollowRequests, firstLocalProfileId, fixture.profile.id),
      0,
    );
    assert.equal(await countPair(ProfileFollows, firstLocalProfileId, fixture.profile.id), 0);
  });

  test('preserves an established relation and applies refreshed policy to new Follow and Accept', async () => {
    const remote = await createRemoteActor(ProfileFollowPolicy.OPEN);
    const establishedLocal = await createLocalActor(firstLocalProfileId, 'established');
    const pendingLocal = await createLocalActor(secondLocalProfileId, 'pending');
    await db.insert(ProfileFollows).values({
      followeeProfileId: remote.profile.id,
      followerProfileId: establishedLocal.id,
    });
    await db
      .update(Profiles)
      .set({ followingCount: 1 })
      .where(eq(Profiles.id, establishedLocal.id));
    await db.update(Profiles).set({ followersCount: 1 }).where(eq(Profiles.id, remote.profile.id));

    await handleInboundUpdate(
      createContext(),
      new Update({
        actor: remoteActorUri,
        object: createActor({ manuallyApprovesFollowers: true }),
      }),
    );

    assert.equal(await countPair(ProfileFollows, establishedLocal.id, remote.profile.id), 1);
    assert.deepEqual(await readCounts(establishedLocal.id, remote.profile.id), {
      follower: 1,
      followee: 1,
    });

    mock.method(console, 'error', () => undefined);
    const followed = await followProfile({
      followerProfileId: pendingLocal.id,
      followeeProfileId: remote.profile.id,
    });
    assert.equal(followed.result.kind, 'PENDING');
    assert.equal(await countPair(ProfileFollows, pendingLocal.id, remote.profile.id), 0);
    assert.equal(await countPair(ProfileFollowRequests, pendingLocal.id, remote.profile.id), 1);
    assert.deepEqual(await readCounts(pendingLocal.id, remote.profile.id), {
      follower: 0,
      followee: 1,
    });

    if (followed.result.kind !== 'PENDING') {
      assert.fail('Expected pending follow request');
    }
    const request = followed.result.profileFollowRequest;
    const follow = new Follow({
      actor: new URL(`/ap/actor/${pendingLocal.id}`, publicOrigin),
      id: new URL(`/ap/follow/${request.id}`, publicOrigin),
      object: remoteActorUri,
      published: request.createdAt,
    });
    await handleInboundAccept(
      createContext(pendingLocal.id),
      new Accept({ actor: remoteActorUri, object: follow }),
    );

    assert.equal(await countPair(ProfileFollowRequests, pendingLocal.id, remote.profile.id), 0);
    assert.equal(await countPair(ProfileFollows, establishedLocal.id, remote.profile.id), 1);
    assert.equal(await countPair(ProfileFollows, pendingLocal.id, remote.profile.id), 1);
    assert.deepEqual(await readCounts(pendingLocal.id, remote.profile.id), {
      follower: 1,
      followee: 2,
    });
  });

  test('creates an established Follow immediately after policy refreshes to open', async () => {
    const remote = await createRemoteActor(ProfileFollowPolicy.APPROVAL_REQUIRED);
    const local = await createLocalActor(firstLocalProfileId, 'update-local-open');

    await handleInboundUpdate(
      createContext(),
      new Update({
        actor: remoteActorUri,
        object: createActor({ manuallyApprovesFollowers: false }),
      }),
    );

    mock.method(console, 'error', () => undefined);
    const followed = await followProfile({
      followerProfileId: local.id,
      followeeProfileId: remote.profile.id,
    });

    assert.equal(followed.result.kind, 'ESTABLISHED');
    assert.equal(await countPair(ProfileFollowRequests, local.id, remote.profile.id), 0);
    assert.equal(await countPair(ProfileFollows, local.id, remote.profile.id), 1);
    assert.deepEqual(await readCounts(local.id, remote.profile.id), {
      follower: 1,
      followee: 1,
    });
  });
});

type PersonOptions = ConstructorParameters<typeof Person>[0];

const createActor = (overrides: Partial<PersonOptions> = {}) =>
  new Person({
    endpoints: new Endpoints({ sharedInbox: new URL('https://remote.example/inbox-updated') }),
    followers: new URL('https://remote.example/users/alice/followers-updated'),
    following: new URL('https://remote.example/users/alice/following-updated'),
    id: remoteActorUri,
    inbox: new URL('https://remote.example/users/alice/inbox-updated'),
    manuallyApprovesFollowers: false,
    name: 'Alice',
    outbox: new URL('https://remote.example/users/alice/outbox-updated'),
    preferredUsername: 'alice',
    summary: 'Remote bio',
    ...overrides,
  });

const createContext = (
  recipient: string | null = null,
  documentLoader: DocumentLoader = async (url) => {
    throw new Error(`Unexpected document load: ${url}`);
  },
): InboxContext<FedifyContextData> =>
  ({
    canonicalOrigin: publicOrigin,
    data: createFedifyContextData(),
    documentLoader,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, publicOrigin),
    recipient,
  }) as unknown as InboxContext<FedifyContextData>;

const createRemoteActor = async (followPolicy: ProfileFollowPolicy) => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: 'https://remote.example',
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: 'Alice',
      followPolicy,
      handle: 'alice',
      instanceId: instance.id,
      normalizedHandle: 'alice',
    })
    .returning()
    .then(firstOrThrow);
  const actor = await db
    .insert(ActivityPubActors)
    .values({
      inboxUri: 'https://remote.example/users/alice/inbox',
      lastFetchedAt: Temporal.Instant.from('2026-07-01T00:00:00Z'),
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    })
    .returning()
    .then(firstOrThrow);

  return { actor, instance, profile };
};

const createLocalActor = async (id: string, handle: string) => {
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      id,
      instanceId: localInstanceId,
      normalizedHandle: handle,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: new URL(`/ap/actor/${profile.id}`, publicOrigin).href,
  });
  return profile;
};

const readRemoteActor = (profileId: string) =>
  db
    .select({ actor: ActivityPubActors, profile: Profiles })
    .from(Profiles)
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(eq(Profiles.id, profileId))
    .limit(1)
    .then(firstOrThrow);

const readProfileMedia = (profileId: string) =>
  db
    .select({
      altText: Media.altText,
      kind: ProfileMedia.kind,
      url: Media.url,
    })
    .from(ProfileMedia)
    .innerJoin(Media, eq(Media.id, ProfileMedia.mediaId))
    .where(eq(ProfileMedia.profileId, profileId))
    .orderBy(ProfileMedia.kind);

const readCounts = async (followerProfileId: string, followeeProfileId: string) => {
  const follower = await db
    .select({ count: Profiles.followingCount })
    .from(Profiles)
    .where(eq(Profiles.id, followerProfileId))
    .limit(1)
    .then(first);
  const followee = await db
    .select({ count: Profiles.followersCount })
    .from(Profiles)
    .where(eq(Profiles.id, followeeProfileId))
    .limit(1)
    .then(first);

  return { follower: follower?.count, followee: followee?.count };
};

const countPair = (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  followerProfileId: string,
  followeeProfileId: string,
) =>
  db
    .select()
    .from(table)
    .where(
      and(
        eq(table.followerProfileId, followerProfileId),
        eq(table.followeeProfileId, followeeProfileId),
      ),
    )
    .then((rows) => rows.length);

const cleanFixtures = async () => {
  await db.delete(ProfileMedia);
  await db.delete(Media);
  const remoteInstances = await db
    .select({ id: Instances.id })
    .from(Instances)
    .where(eq(Instances.domain, 'remote.example'));
  await db.delete(Profiles).where(
    inArray(Profiles.id, [
      firstLocalProfileId,
      secondLocalProfileId,
      ...(
        await db
          .select({ id: Profiles.id })
          .from(Profiles)
          .where(
            inArray(
              Profiles.instanceId,
              remoteInstances.map(({ id }) => id),
            ),
          )
      ).map(({ id }) => id),
    ]),
  );
  if (remoteInstances.length > 0) {
    await db.delete(Instances).where(
      inArray(
        Instances.id,
        remoteInstances.map(({ id }) => id),
      ),
    );
  }
};
