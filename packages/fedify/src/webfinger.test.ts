import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as FederationModule from './federation';
import type * as WebFinger from './webfinger';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubActorKeys: typeof CoreDb.ActivityPubActorKeys;
let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let ProfileMedia: typeof CoreDb.ProfileMedia;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let federation: typeof FederationModule.federation;
let resolveLocalActorIdentifierByHandle: typeof WebFinger.resolveLocalActorIdentifierByHandle;

describe('WebFinger local profile handle mapping', () => {
  let localInstanceId: string;
  let remoteInstanceId: string;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({
      Accounts,
      ActivityPubActorKeys,
      ActivityPubActors,
      db,
      firstOrThrow,
      Instances,
      Media,
      pg,
      ProfileMedia,
      Profiles,
    } = await import('@kosmo/core/db'));
    ({ federation } = await import('./federation'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ resolveLocalActorIdentifierByHandle } = await import('./webfinger'));

    await truncateDatabase();

    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
    remoteInstanceId = await createRemoteInstance();
  });

  beforeEach(async () => {
    await db.delete(Media);
    await db.delete(Profiles);
  });

  after(async () => {
    await pg.end();
  });

  test('returns the active local profile id for a matching handle', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle('alice'), profile.id);
  });

  test('normalizes the queried handle before lookup', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle(' Alice '), profile.id);
    assert.equal(await resolveLocalActorIdentifierByHandle('Alice'), profile.id);
  });

  test('returns null when the local handle does not exist', async () => {
    assert.equal(await resolveLocalActorIdentifierByHandle('missing'), null);
  });

  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    test(`returns null when the matching local profile is ${state}`, async () => {
      await createProfile({ handle: 'alice', instanceId: localInstanceId, state });

      assert.equal(await resolveLocalActorIdentifierByHandle('alice'), null);
    });
  }

  test('ignores a matching handle from a non-configured instance', async () => {
    await createProfile({ handle: 'alice', instanceId: remoteInstanceId });

    assert.equal(await resolveLocalActorIdentifierByHandle('alice'), null);
  });

  test('serves a WebFinger JRD for a local active profile handle', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    const response = await federation.fetch(
      new Request(
        `${publicOrigin}/.well-known/webfinger?resource=${encodeURIComponent(
          'acct:alice@127.0.0.1:4173',
        )}`,
      ),
      { contextData: undefined },
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/jrd\+json/);

    const json = (await response.json()) as {
      subject?: string;
      links?: Array<{ rel?: string; href?: string; type?: string }>;
    };

    assert.equal(json.subject, 'acct:alice@127.0.0.1:4173');
    assert.ok(
      json.links?.some(
        (link) =>
          link.rel === 'self' &&
          link.href === `${publicOrigin}/ap/actor/${profile.id}` &&
          link.type === 'application/activity+json',
      ),
    );
    assert.ok(
      json.links?.some(
        (link) =>
          link.rel === 'http://webfinger.net/rel/profile-page' &&
          link.href === `${publicOrigin}/@alice`,
      ),
    );
  });

  test('serves a WebFinger JRD for the canonical actor URI', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });
    const actorUri = `${publicOrigin}/ap/actor/${profile.id}`;

    const response = await federation.fetch(
      new Request(`${publicOrigin}/.well-known/webfinger?resource=${encodeURIComponent(actorUri)}`),
      { contextData: undefined },
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/jrd\+json/);

    const json = (await response.json()) as {
      subject?: string;
      links?: Array<{ rel?: string; href?: string; type?: string }>;
    };

    assert.equal(json.subject, actorUri);
    assert.ok(
      json.links?.some(
        (link) =>
          link.rel === 'self' &&
          link.href === actorUri &&
          link.type === 'application/activity+json',
      ),
    );
  });

  test('returns 400 for a missing or malformed WebFinger resource', async () => {
    for (const query of ['', '?resource=not-a-url']) {
      const response = await federation.fetch(
        new Request(`${publicOrigin}/.well-known/webfinger${query}`),
        { contextData: undefined },
      );

      assert.equal(response.status, 400);
    }
  });

  test('returns 404 for an unknown or non-local WebFinger resource', async () => {
    for (const resource of ['acct:alice@remote.example', 'https://remote.example/users/alice']) {
      const response = await federation.fetch(
        new Request(
          `${publicOrigin}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
        ),
        { contextData: undefined },
      );

      assert.equal(response.status, 404);
    }
  });

  test('rejects WebFinger requests from a non-canonical host', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });

    for (const resource of [
      'acct:alice@preview.example',
      `${publicOrigin}/ap/actor/${profile.id}`,
    ]) {
      const response = await federation.fetch(
        new Request(
          `http://preview.example/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
        ),
        { contextData: undefined },
      );

      assert.equal(response.status, 404);
    }
  });

  test('serves the canonical actor document and reuses its stored key pairs', async () => {
    const profile = await createProfile({
      bio: 'Local profile bio',
      displayName: 'Alice Profile',
      followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
      handle: 'alice',
      instanceId: localInstanceId,
    });
    const avatar = await createLocalMedia({
      kind: ProfileMediaKind.AVATAR,
      mediaType: 'image/webp',
      profileId: profile.id,
      url: 'https://media.example/alice-avatar.webp',
    });
    const header = await createLocalMedia({
      kind: ProfileMediaKind.HEADER,
      mediaType: 'image/png',
      profileId: profile.id,
      url: 'https://media.example/alice-header.png',
    });
    const requestActor = () =>
      federation.fetch(
        new Request(`${publicOrigin}/ap/actor/${profile.id}`, {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );
    const response = await requestActor();
    const actor = (await response.json()) as {
      assertionMethod?: Array<{ controller?: string; id?: string }>;
      endpoints?: { sharedInbox?: string };
      followers?: string;
      following?: string;
      id?: string;
      icon?: { mediaType?: string; type?: string; url?: string };
      image?: { mediaType?: string; type?: string; url?: string };
      inbox?: string;
      manuallyApprovesFollowers?: boolean;
      name?: string;
      outbox?: string;
      preferredUsername?: string;
      publicKey?: { id?: string; owner?: string };
      published?: string;
      summary?: string;
      url?: string;
    };

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/activity\+json/);
    assert.equal(actor.id, `${publicOrigin}/ap/actor/${profile.id}`);
    assert.equal(actor.preferredUsername, 'alice');
    assert.equal(actor.name, 'Alice Profile');
    assert.equal(actor.summary, 'Local profile bio');
    assert.deepEqual(actor.icon, {
      mediaType: avatar.mediaType,
      type: 'Image',
      url: avatar.url,
    });
    assert.deepEqual(actor.image, {
      mediaType: header.mediaType,
      type: 'Image',
      url: header.url,
    });
    assert.equal(actor.manuallyApprovesFollowers, true);
    assert.equal(actor.url, `${publicOrigin}/@alice`);
    assert.equal(actor.published, profile.createdAt.toString());
    assert.equal(actor.inbox, `${publicOrigin}/ap/actor/${profile.id}/inbox`);
    assert.equal(actor.endpoints?.sharedInbox, `${publicOrigin}/inbox`);
    assert.equal(actor.outbox, `${publicOrigin}/ap/actor/${profile.id}/outbox`);
    assert.equal(actor.followers, `${publicOrigin}/ap/actor/${profile.id}/followers`);
    assert.equal(actor.following, `${publicOrigin}/ap/actor/${profile.id}/following`);
    const actorUri = `${publicOrigin}/ap/actor/${profile.id}`;
    assert.equal(typeof actor.publicKey?.id, 'string');
    assert.equal(actor.publicKey?.owner, actorUri);
    assert.ok(
      actor.assertionMethod?.some(
        (method) => typeof method.id === 'string' && method.controller === actorUri,
      ),
    );
    const actorsAfterFirstRequest = await db.select().from(ActivityPubActors);
    const keysAfterFirstRequest = await db.select().from(ActivityPubActorKeys);
    assert.equal(actorsAfterFirstRequest.length, 1);
    assert.equal(keysAfterFirstRequest.length, 2);

    assert.equal((await requestActor()).status, 200);

    const actorsAfterSecondRequest = await db.select().from(ActivityPubActors);
    const keysAfterSecondRequest = await db.select().from(ActivityPubActorKeys);
    assert.deepEqual(actorsAfterSecondRequest, actorsAfterFirstRequest);
    assert.deepEqual(keysAfterSecondRequest, keysAfterFirstRequest);
  });

  test('reflects optional media replacement and removal while omitting ineligible media', async () => {
    const profile = await createProfile({ handle: 'alice', instanceId: localInstanceId });
    const requestActor = async () => {
      const response = await federation.fetch(
        new Request(`${publicOrigin}/ap/actor/${profile.id}`, {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );

      assert.equal(response.status, 200);
      return (await response.json()) as {
        icon?: { mediaType?: string; type?: string; url?: string };
        image?: { mediaType?: string; type?: string; url?: string };
        manuallyApprovesFollowers?: boolean;
        summary?: string;
      };
    };

    const initial = await requestActor();
    assert.equal(initial.icon, undefined);
    assert.equal(initial.image, undefined);
    assert.equal(initial.summary, undefined);
    assert.equal(initial.manuallyApprovesFollowers, false);

    await createLocalMedia({
      kind: ProfileMediaKind.AVATAR,
      profileId: profile.id,
      state: MediaState.UPLOADING,
    });
    assert.equal((await requestActor()).icon, undefined);
    await db.delete(ProfileMedia).where(eq(ProfileMedia.profileId, profile.id));

    const otherProfile = await createProfile({ handle: 'other', instanceId: localInstanceId });
    const otherAvatar = await createLocalMedia({
      kind: ProfileMediaKind.AVATAR,
      profileId: otherProfile.id,
      url: 'https://media.example/other-avatar.png',
    });
    await db.insert(ProfileMedia).values({
      kind: ProfileMediaKind.AVATAR,
      mediaId: otherAvatar.id,
      profileId: profile.id,
    });
    assert.equal((await requestActor()).icon, undefined);
    await db.delete(ProfileMedia).where(eq(ProfileMedia.profileId, profile.id));

    const firstAvatar = await createLocalMedia({
      kind: ProfileMediaKind.AVATAR,
      profileId: profile.id,
      url: 'https://media.example/avatar-first.png',
    });
    assert.equal((await requestActor()).icon?.url, firstAvatar.url);

    const replacementAvatar = await createLocalMedia({
      link: false,
      profileId: profile.id,
      url: 'https://media.example/avatar-replacement.png',
    });
    await db
      .update(ProfileMedia)
      .set({ mediaId: replacementAvatar.id })
      .where(
        and(eq(ProfileMedia.profileId, profile.id), eq(ProfileMedia.kind, ProfileMediaKind.AVATAR)),
      );
    assert.equal((await requestActor()).icon?.url, replacementAvatar.url);

    await db.delete(ProfileMedia).where(eq(ProfileMedia.profileId, profile.id));
    const removed = await requestActor();
    assert.equal(removed.icon, undefined);
    assert.equal(removed.image, undefined);
    assert.equal(removed.summary, undefined);
    assert.equal(removed.manuallyApprovesFollowers, false);
  });

  test('serves count-only followers and following collections without creating actor keys', async () => {
    const profile = await createProfile({
      followersCount: 41,
      followingCount: 43,
      handle: 'alice',
      instanceId: localInstanceId,
    });

    for (const [collection, totalItems] of [
      ['followers', 41],
      ['following', 43],
    ] as const) {
      const collectionUri = `${publicOrigin}/ap/actor/${profile.id}/${collection}`;
      const response = await federation.fetch(
        new Request(collectionUri, { headers: { accept: 'application/activity+json' } }),
        { contextData: undefined },
      );
      const json = (await response.json()) as {
        first?: string;
        id?: string;
        last?: string;
        orderedItems?: unknown[];
        totalItems?: number;
        type?: string;
      };

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /application\/activity\+json/);
      assert.equal(json.id, collectionUri);
      assert.equal(json.type, 'OrderedCollection');
      assert.equal(json.totalItems, totalItems);
      assert.deepEqual(json.orderedItems ?? [], []);
      assert.equal(json.first, undefined);
      assert.equal(json.last, undefined);

      const pageResponse = await federation.fetch(
        new Request(`${collectionUri}?cursor=arbitrary`, {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );
      assert.equal(pageResponse.status, 404);

      const alternateHostResponse = await federation.fetch(
        new Request(collectionUri.replace(publicOrigin, 'https://alternate.example'), {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );
      assert.equal(alternateHostResponse.status, 404);
    }

    assert.deepEqual(await db.select().from(ActivityPubActors), []);
    assert.deepEqual(await db.select().from(ActivityPubActorKeys), []);
  });

  test('does not serve follow count collections for unavailable profiles', async () => {
    const remote = await createProfile({ handle: 'remote', instanceId: remoteInstanceId });
    const disabled = await createProfile({
      handle: 'disabled',
      instanceId: localInstanceId,
      state: ProfileState.DISABLED,
    });
    const suspended = await createProfile({
      handle: 'suspended',
      instanceId: localInstanceId,
      state: ProfileState.SUSPENDED,
    });

    for (const profileId of [
      '019f6f67-1111-7777-8888-123456789abc',
      remote.id,
      disabled.id,
      suspended.id,
      'not-a-profile-id',
    ]) {
      for (const collection of ['followers', 'following']) {
        const response = await federation.fetch(
          new Request(`${publicOrigin}/ap/actor/${profileId}/${collection}`, {
            headers: { accept: 'application/activity+json' },
          }),
          { contextData: undefined },
        );

        assert.equal(response.status, 404);
      }
    }

    assert.deepEqual(await db.select().from(ActivityPubActors), []);
    assert.deepEqual(await db.select().from(ActivityPubActorKeys), []);
  });

  test('returns 404 for a missing local actor document', async () => {
    const response = await federation.fetch(
      new Request(`${publicOrigin}/ap/actor/019f6f67-1111-7777-8888-123456789abc`, {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );

    assert.equal(response.status, 404);
  });

  test('rejects a non-canonical uppercase local actor identifier', async () => {
    const profile = await createProfile({
      handle: 'alice',
      id: '019f6f67-abcd-7777-8888-abcdefabcdef',
      instanceId: localInstanceId,
    });
    const response = await federation.fetch(
      new Request(`${publicOrigin}/ap/actor/${profile.id.toUpperCase()}`, {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );

    assert.equal(response.status, 404);
    assert.equal((await db.select().from(ActivityPubActors)).length, 0);
  });
});

const truncateDatabase = async () => {
  assertTestDatabaseUrl();

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

const assertTestDatabaseUrl = () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  assert.ok(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert.match(databaseName, /^kosmo_test(?:_[a-z0-9_]+)?$/);
};

const createRemoteInstance = async () =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: 'https://remote.example',
      domain: 'remote.example',
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning({ id: Instances.id })
    .then(firstOrThrow)
    .then((instance) => instance.id);

const createProfile = async ({
  bio,
  displayName,
  followPolicy = ProfileFollowPolicy.OPEN,
  followersCount,
  followingCount,
  handle,
  id,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  bio?: string | null;
  displayName?: string;
  followPolicy?: ProfileFollowPolicy;
  followersCount?: number;
  followingCount?: number;
  handle: string;
  id?: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      bio,
      displayName: displayName ?? handle,
      followPolicy,
      ...(followersCount == null ? {} : { followersCount }),
      ...(followingCount == null ? {} : { followingCount }),
      handle,
      ...(id ? { id } : {}),
      instanceId,
      normalizedHandle: normalizeHandle(handle),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createLocalMedia = async ({
  kind,
  link = true,
  mediaType = 'image/png',
  profileId,
  state = MediaState.READY,
  url = 'https://media.example/profile.png',
}: {
  kind?: ProfileMediaKind;
  link?: boolean;
  mediaType?: string;
  profileId: string;
  state?: MediaState;
  url?: string;
}) => {
  const now = Temporal.Instant.from('2026-07-31T00:00:00Z');
  const account = await db
    .insert(Accounts)
    .values({
      displayName: 'Media owner',
      oidcSubject: `actor-media-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const media = await db
    .insert(Media)
    .values({
      accountId: account.id,
      mediaType: state === MediaState.READY ? mediaType : null,
      profileId,
      readyAt: state === MediaState.READY ? now : null,
      source: MediaSource.LOCAL,
      state,
      storageReference: `actor-media-${crypto.randomUUID()}`,
      uploadExpiresAt: now.add({ hours: 1 }),
      url: state === MediaState.READY ? url : null,
    })
    .returning()
    .then(firstOrThrow);

  if (link) {
    if (!kind) {
      throw new Error('Profile media kind is required when linking media');
    }
    await db.insert(ProfileMedia).values({ kind, mediaId: media.id, profileId });
  }

  return media;
};
