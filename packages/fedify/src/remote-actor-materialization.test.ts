import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { Endpoints, Image, LanguageString, Link, Note, Person } from '@fedify/vocab';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
} from '@kosmo/core/enums';
import { ApplicationFailure } from '@temporalio/client';
import { and, count, eq, ne } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Object as ActivityPubObject } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreTemporal from '@kosmo/core/temporal/client';
import type * as Materialization from './remote-actor-materialization';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteDomain = 'remote.example';
const remoteAliasDomain = 'alias.example';
const remoteActorUri = new URL(`https://${remoteDomain}/users/alice`);

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let db: typeof CoreDb.db;
let first: typeof CoreDb.first;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let ProfileMedia: typeof CoreDb.ProfileMedia;
let Profiles: typeof CoreDb.Profiles;
let seedDatabase: typeof CoreSeed.seedDatabase;
let temporalClient: typeof CoreTemporal.temporalClient;
let findOrMaterializeRemoteProfileActor: typeof Materialization.findOrMaterializeRemoteProfileActor;
let findOrMaterializeRemoteProfileActorByUri: typeof Materialization.findOrMaterializeRemoteProfileActorByUri;
let materializeRemoteProfileActor: typeof Materialization.materializeRemoteProfileActor;
let RemoteActorMaterializationError: typeof Materialization.RemoteActorMaterializationError;

describe('remote actor materialization', () => {
  let localInstanceId: string;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;

    ({ ActivityPubActors, db, first, firstOrThrow, Instances, Media, pg, ProfileMedia, Profiles } =
      await import('@kosmo/core/db'));
    ({ seedDatabase } = await import('@kosmo/core/db/seed'));
    ({ temporalClient } = await import('@kosmo/core/temporal/client'));
    ({
      findOrMaterializeRemoteProfileActor,
      findOrMaterializeRemoteProfileActorByUri,
      materializeRemoteProfileActor,
      RemoteActorMaterializationError,
    } = await import('./remote-actor-materialization'));

    await truncateDatabase();
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(ProfileMedia);
    await db.delete(Media);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  afterEach(() => mock.restoreAll());

  after(async () => {
    await pg.end();
  });

  test('stores a looked-up actor and its endpoint metadata', async () => {
    const actor = createActor();
    const { context, lookupObject } = createLookupContext(async () => actor);
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
      now,
    });

    assert.equal(profile.handle, 'alice');
    assert.equal(profile.displayName, 'Alice Remote');
    assert.equal(profile.bio, 'Remote bio');
    assert.equal(profile.followPolicy, ProfileFollowPolicy.APPROVAL_REQUIRED);
    assert.equal(profile.createdAt.toString(), '2024-01-02T03:04:05Z');
    assert.equal(lookupObject.mock.calls.length, 1);
    assert.equal(
      (lookupObject.mock.calls as unknown as Array<{ arguments: unknown[] }>)[0]?.arguments[0],
      remoteActorUri,
    );

    const stored = await db
      .select({ actor: ActivityPubActors, instance: Instances })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Profiles.id, profile.id))
      .limit(1)
      .then(firstOrThrow);

    assert.equal(stored.instance.domain, remoteDomain);
    assert.equal(stored.instance.kind, InstanceKind.ACTIVITYPUB);
    assert.equal(stored.actor.uri, actor.id?.href);
    assert.equal(stored.actor.type, ActivityPubActorType.PERSON);
    assert.equal(stored.actor.inboxUri, `https://${remoteDomain}/users/alice/inbox`);
    assert.equal(stored.actor.outboxUri, `https://${remoteDomain}/users/alice/outbox`);
    assert.equal(stored.actor.followersUri, `https://${remoteDomain}/users/alice/followers`);
    assert.equal(stored.actor.followingUri, `https://${remoteDomain}/users/alice/following`);
    assert.equal(stored.actor.sharedInboxUri, `https://${remoteDomain}/inbox`);
    assert.equal(stored.actor.lastFetchedAt?.toString(), now.toString());
  });

  test('stores the first validated actor profile URL and clears it on refresh', async () => {
    const firstUrl = new URL('https://profile.example/@alice');
    const secondUrl = new URL('https://profile.example/@alice-second');
    const actorUri = new URL(`https://${remoteDomain}/users/alice`);
    const firstNow = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const profile = await materializeRemoteProfileActor({
      context: createLookupContext(async () => createActor({ urls: [firstUrl, secondUrl] }))
        .context,
      actorUri,
      now: firstNow,
    });

    const firstStored = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(firstStored.profileUrl, firstUrl.href);

    const linkUrl = new URL('https://profile.example/@alice-link');
    await materializeRemoteProfileActor({
      context: createLookupContext(async () => createActor({ url: new Link({ href: linkUrl }) }))
        .context,
      actorUri,
      now: firstNow.add({ seconds: 1 }),
    });

    const linkStored = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(linkStored.profileUrl, linkUrl.href);

    await materializeRemoteProfileActor({
      context: createLookupContext(async () =>
        createActor({ url: new URL('ftp://profile.example/@alice') }),
      ).context,
      actorUri,
      now: firstNow.add({ seconds: 2 }),
    });

    const invalidStored = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(invalidStored.profileUrl, null);

    await materializeRemoteProfileActor({
      context: createLookupContext(async () => createActor({ url: secondUrl })).context,
      actorUri,
      now: firstNow.add({ seconds: 3 }),
    });

    const restoredStored = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(restoredStored.profileUrl, secondUrl.href);

    await materializeRemoteProfileActor({
      context: createLookupContext(async () => createActor()).context,
      actorUri,
      now: firstNow.add({ seconds: 4 }),
    });

    const missingStored = await db
      .select({ profileUrl: ActivityPubActors.profileUrl })
      .from(ActivityPubActors)
      .where(eq(ActivityPubActors.profileId, profile.id))
      .then(firstOrThrow);
    assert.equal(missingStored.profileUrl, null);
  });

  test('materializes, replaces, and removes embedded actor avatar and header Media', async () => {
    const avatarUrl = new URL(`https://${remoteDomain}/media/avatar.png`);
    const headerUrl = new URL(`https://${remoteDomain}/media/header.png`);
    const firstNow = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const firstActor = createActor({
      icon: new Image({ mediaType: 'image/png', name: 'Avatar', url: avatarUrl }),
      image: new Image({ mediaType: 'image/webp', name: 'Header', url: headerUrl }),
    });
    const first = await materializeRemoteProfileActor({
      context: createLookupContext(async () => firstActor).context,
      actorUri: remoteActorUri,
      now: firstNow,
    });

    const firstMedia = await readProfileMedia(first.id);
    assert.deepEqual(
      firstMedia.map(({ altText, kind, mediaType, source, state, url }) => ({
        altText,
        kind,
        mediaType,
        source,
        state,
        url,
      })),
      [
        {
          altText: 'Avatar',
          kind: ProfileMediaKind.AVATAR,
          mediaType: 'image/png',
          source: MediaSource.REMOTE,
          state: MediaState.READY,
          url: avatarUrl.href,
        },
        {
          altText: 'Header',
          kind: ProfileMediaKind.HEADER,
          mediaType: 'image/webp',
          source: MediaSource.REMOTE,
          state: MediaState.READY,
          url: headerUrl.href,
        },
      ],
    );

    const nextAvatarUrl = new URL(`https://${remoteDomain}/media/avatar-next.png`);
    const nextActor = createActor({
      icon: new Image({ mediaType: null, name: 'Next Avatar', url: nextAvatarUrl }),
    });
    await materializeRemoteProfileActor({
      context: createLookupContext(async () => nextActor).context,
      actorUri: remoteActorUri,
      now: firstNow.add({ seconds: 1 }),
    });

    const refreshedMedia = await readProfileMedia(first.id);
    assert.deepEqual(
      refreshedMedia.map(({ altText, kind, mediaType, url }) => ({
        altText,
        kind,
        mediaType,
        url,
      })),
      [
        {
          altText: 'Next Avatar',
          kind: ProfileMediaKind.AVATAR,
          mediaType: null,
          url: nextAvatarUrl.href,
        },
      ],
    );
    assert.equal(await db.$count(Media, eq(Media.profileId, first.id)), 3);
  });

  test('stores a shared avatar/header URL as separate Media identities', async () => {
    const sharedUrl = new URL(`https://${remoteDomain}/media/shared.png`);
    const profile = await materializeRemoteProfileActor({
      context: createLookupContext(async () =>
        createActor({
          icon: new Image({ mediaType: 'image/png', name: 'Avatar', url: sharedUrl }),
          image: new Image({ mediaType: 'image/webp', name: 'Header', url: sharedUrl }),
        }),
      ).context,
      actorUri: remoteActorUri,
    });

    const media = await readProfileMedia(profile.id);
    assert.equal(media.length, 2);
    const mediaIds = await db
      .select({ mediaId: ProfileMedia.mediaId })
      .from(ProfileMedia)
      .where(eq(ProfileMedia.profileId, profile.id));
    assert.equal(new Set(mediaIds.map(({ mediaId }) => mediaId)).size, 2);
    assert.deepEqual(
      media.map(({ altText, kind, mediaType, url }) => ({ altText, kind, mediaType, url })),
      [
        {
          altText: 'Avatar',
          kind: ProfileMediaKind.AVATAR,
          mediaType: 'image/png',
          url: sharedUrl.href,
        },
        {
          altText: 'Header',
          kind: ProfileMediaKind.HEADER,
          mediaType: 'image/webp',
          url: sharedUrl.href,
        },
      ],
    );
  });

  test('splits a transition-era shared avatar/header Media on the first refresh', async () => {
    const sharedUrl = new URL(`https://${remoteDomain}/media/shared-transition.png`);
    const { profile } = await createStoredRemoteActor();
    const sharedMedia = await db
      .insert(Media)
      .values({
        altText: 'Transition',
        mediaType: 'image/png',
        profileId: profile.id,
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: sharedUrl.href,
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ProfileMedia).values([
      { kind: ProfileMediaKind.AVATAR, mediaId: sharedMedia.id, profileId: profile.id },
      { kind: ProfileMediaKind.HEADER, mediaId: sharedMedia.id, profileId: profile.id },
    ]);

    await materializeRemoteProfileActor({
      context: createLookupContext(async () =>
        createActor({
          icon: new Image({ mediaType: 'image/png', name: 'Avatar', url: sharedUrl }),
          image: new Image({ mediaType: 'image/webp', name: 'Header', url: sharedUrl }),
        }),
      ).context,
      actorUri: remoteActorUri,
      now: Temporal.Instant.from('2026-07-10T00:00:00Z'),
    });

    const relations = await db
      .select({ kind: ProfileMedia.kind, mediaId: ProfileMedia.mediaId })
      .from(ProfileMedia)
      .where(eq(ProfileMedia.profileId, profile.id))
      .orderBy(ProfileMedia.kind);
    assert.equal(new Set(relations.map(({ mediaId }) => mediaId)).size, 2);
    assert.deepEqual(await readProfileMedia(profile.id), [
      {
        altText: 'Avatar',
        kind: ProfileMediaKind.AVATAR,
        mediaType: 'image/png',
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: sharedUrl.href,
      },
      {
        altText: 'Header',
        kind: ProfileMediaKind.HEADER,
        mediaType: 'image/webp',
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: sharedUrl.href,
      },
    ]);
  });

  test('ignores IRI-only and invalid actor representations without rejecting the profile', async () => {
    const actor = createActor({
      icon: new URL(`https://${remoteDomain}/media/avatar.png`),
      image: new Image({ url: new URL('data:image/png;base64,AA==') }),
    });

    const profile = await materializeRemoteProfileActor({
      context: createLookupContext(async () => actor).context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.displayName, 'Alice Remote');
    assert.deepEqual(await readProfileMedia(profile.id), []);
  });

  test('preserves the previous actor projection when Profile media refresh fails', async () => {
    const originalAvatarUrl = new URL(`https://${remoteDomain}/media/avatar.png`);
    const originalNow = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const original = await materializeRemoteProfileActor({
      context: createLookupContext(async () =>
        createActor({
          icon: new Image({
            mediaType: 'image/png',
            url: originalAvatarUrl,
          }),
        }),
      ).context,
      actorUri: remoteActorUri,
      now: originalNow,
    });
    const refreshedActor = createActor({
      icon: new Image({
        mediaType: 'image/webp',
        url: new URL(`https://${remoteDomain}/media/avatar-next.webp`),
      }),
      name: 'Refreshed Alice',
    });
    await pg`
      CREATE FUNCTION fail_remote_profile_media_insert() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'intentional remote profile media failure';
      END
      $function$
    `;
    await pg`
      CREATE TRIGGER fail_remote_profile_media_insert
      BEFORE INSERT ON profile_media
      FOR EACH ROW EXECUTE FUNCTION fail_remote_profile_media_insert()
    `;

    try {
      await assert.rejects(
        materializeRemoteProfileActor({
          context: createLookupContext(async () => refreshedActor).context,
          actorUri: remoteActorUri,
          now: originalNow.add({ seconds: 1 }),
        }),
      );
      const persistedProfile = await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, original.id))
        .limit(1)
        .then(firstOrThrow);
      const persistedActor = await db
        .select()
        .from(ActivityPubActors)
        .where(eq(ActivityPubActors.profileId, original.id))
        .limit(1)
        .then(firstOrThrow);
      assert.equal(persistedProfile.displayName, 'Alice Remote');
      assert.equal(persistedActor.lastFetchedAt?.toString(), originalNow.toString());
      assert.deepEqual(
        (await readProfileMedia(original.id)).map(({ kind, mediaType, url }) => ({
          kind,
          mediaType,
          url,
        })),
        [
          {
            kind: ProfileMediaKind.AVATAR,
            mediaType: 'image/png',
            url: originalAvatarUrl.href,
          },
        ],
      );
      assert.equal(await db.$count(Media), 1);
    } finally {
      await pg`DROP TRIGGER fail_remote_profile_media_insert ON profile_media`;
      await pg`DROP FUNCTION fail_remote_profile_media_insert()`;
    }
  });

  test('materializes an inbound actor URI directly', async () => {
    const actor = createActor();
    const lookupObject = mock.fn(async () => actor);

    const result = await findOrMaterializeRemoteProfileActorByUri({
      actorUri: actor.id!,
      context: { lookupObject },
    });

    assert.equal(result.actor.uri, actor.id?.href);
    assert.equal(
      (lookupObject.mock.calls as unknown as Array<{ arguments: unknown[] }>)[0]?.arguments[0],
      actor.id,
    );
  });

  test('rejects an inbound actor URI mismatch before persisting the looked-up actor', async () => {
    const expectedActorUri = new URL(`https://${remoteDomain}/users/alice`);
    const returnedActor = createActor({
      id: new URL(`https://${remoteDomain}/users/mallory`),
    });
    const lookupObject = mock.fn(async () => returnedActor);
    mockWebFinger({ subject: `acct:alice@${remoteDomain}` });

    await assert.rejects(
      findOrMaterializeRemoteProfileActorByUri({
        actorUri: expectedActorUri,
        context: { lookupObject },
      }),
      RemoteActorMaterializationError,
    );

    assert.equal(await db.$count(ActivityPubActors), 0);
    assert.equal(await db.$count(Profiles), 0);
  });

  test('reactivates an unknown actor instance only after materialization succeeds', async () => {
    const instance = await createRemoteInstance({ state: InstanceState.UNRESPONSIVE });
    const actor = createActor();
    const lookupObject = mock.fn(async () => actor);

    await findOrMaterializeRemoteProfileActorByUri({
      actorUri: actor.id!,
      context: { lookupObject },
    });

    const reactivated = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, instance.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(reactivated.state, InstanceState.ACTIVE);
  });

  test('keeps an unknown actor instance UNRESPONSIVE when materialization fails', async () => {
    const instance = await createRemoteInstance({ state: InstanceState.UNRESPONSIVE });
    const actor = createActor();
    const lookupObject = mock.fn(async () => null);

    await assert.rejects(
      findOrMaterializeRemoteProfileActorByUri({
        actorUri: actor.id!,
        context: { lookupObject },
      }),
      RemoteActorMaterializationError,
    );

    const preserved = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, instance.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(preserved.state, InstanceState.UNRESPONSIVE);
  });

  test('reuses a stored inbound actor and reactivates UNRESPONSIVE with compare-and-set', async () => {
    const stored = await createStoredRemoteActor({ instanceState: InstanceState.UNRESPONSIVE });
    const lookupObject = mock.fn(async () => createActor());

    const result = await findOrMaterializeRemoteProfileActorByUri({
      actorUri: new URL(stored.actor.uri),
      context: { lookupObject },
    });

    assert.equal(result.profile.id, stored.profile.id);
    assert.equal(result.instance.state, InstanceState.ACTIVE);
    assert.equal(lookupObject.mock.calls.length, 0);
  });

  test('ignores a stored SUSPENDED inbound actor without network access', async () => {
    const stored = await createStoredRemoteActor({ instanceState: InstanceState.SUSPENDED });
    const lookupObject = mock.fn(async () => createActor());

    await assert.rejects(
      findOrMaterializeRemoteProfileActorByUri({
        actorUri: new URL(stored.actor.uri),
        context: { lookupObject },
      }),
      /Profile not found/,
    );
    assert.equal(lookupObject.mock.calls.length, 0);
  });

  test('preserves reserved remote handle casing during lookup', async () => {
    const actor = createActor({ preferredUsername: 'Admin' });
    const { context, lookupObject } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.handle, 'Admin');
    assert.equal(profile.normalizedHandle, 'admin');
    assert.equal(lookupObject.mock.calls[0]?.arguments[0], remoteActorUri);
  });

  test('finds a stored actor by its canonical URI', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const { context, lookupObject } = createLookupContext(async () => createActor());

    const materialized = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
      now,
    });
    const canonical = await findOrMaterializeRemoteProfileActor({
      actorUri: remoteActorUri,
      now,
    });

    const instance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, materialized.instanceId!))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(instance.domain, remoteDomain);
    assert.equal(canonical.id, materialized.id);
    assert.equal(lookupObject.mock.calls.length, 1);
  });

  test('moves an existing actor to the canonical actor domain', async () => {
    const aliasInstance = await createRemoteInstance({ domain: remoteAliasDomain });
    const aliasProfile = await createProfile({ handle: 'alice', instanceId: aliasInstance.id });
    await db.insert(ActivityPubActors).values({
      profileId: aliasProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: `https://${remoteDomain}/users/alice`,
    });
    const { context } = createLookupContext(async () => createActor());

    const materialized = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    const instance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.id, materialized.instanceId!))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(materialized.id, aliasProfile.id);
    assert.equal(instance.domain, remoteDomain);
  });

  test('rejects lookup errors, missing objects, and non-actors without creating profiles', async () => {
    const lookupError = new Error('lookup failed');
    const cases: Array<{
      expected: RegExp;
      result: ActivityPubObject | Error | null;
    }> = [
      { expected: /lookup failed/, result: lookupError },
      { expected: /did not return an actor/, result: null },
      {
        expected: /did not return an actor/,
        result: new Note({ id: new URL(`https://${remoteDomain}/notes/1`), content: 'note' }),
      },
    ];

    for (const { expected, result } of cases) {
      const { context } = createLookupContext(async () => {
        if (result instanceof Error) {
          throw result;
        }
        return result;
      });

      await assert.rejects(
        materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
        expected,
      );
      assert.equal(await countRows(Profiles), 0);
      assert.equal(await countRows(Instances), 1);
    }
  });

  test('rejects unsupported preferred usernames', async () => {
    const { context } = createLookupContext(async () =>
      createActor({ preferredUsername: 'alice with spaces' }),
    );

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      RemoteActorMaterializationError,
    );
    assert.equal(await countRows(Profiles), 0);
  });

  test('materializes a language-tagged preferred username', async () => {
    const actor = createActor({ preferredUsername: new LanguageString('alice', 'en') });
    const { context } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.handle, 'alice');
    assert.equal(profile.normalizedHandle, 'alice');
  });

  test('materializes a language-tagged actor name', async () => {
    const actor = createActor({ name: new LanguageString('Alice Remote', 'en') });
    const { context } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.displayName, 'Alice Remote');
  });

  test('materializes a language-tagged actor summary', async () => {
    const actor = createActor({ summary: new LanguageString('Remote bio', 'en') });
    const { context } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.bio, 'Remote bio');
  });

  test('projects a string HTML actor summary into a plain-text bio', async () => {
    const actor = createActor({
      summary:
        '<p>Hello <a href="https://remote.example">world</a></p>' +
        '<script>hidden</script><style>hidden</style>',
    });
    const { context } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.bio, 'Hello world');
  });

  test('projects a language-tagged HTML actor summary through the same boundary', async () => {
    const actor = createActor({
      summary: new LanguageString('<p>Hello &amp; <strong>world</strong></p>', 'en'),
    });
    const { context } = createLookupContext(async () => actor);

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.bio, 'Hello & world');
  });

  test('validates the projected bio length after markup projection', async () => {
    const visibleText = 'a'.repeat(500);
    const { context } = createLookupContext(async () =>
      createActor({ summary: `<p><strong>${visibleText}</strong></p>` }),
    );

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.bio, visibleText);
  });

  test('stores null when the actor summary has no visible text', async () => {
    const { context } = createLookupContext(async () =>
      createActor({ summary: '<script>hidden</script><style>hidden</style>' }),
    );

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.bio, null);
  });

  test('falls back to the handle when the actor name is unsupported', async () => {
    const { context } = createLookupContext(async () => createActor({ name: 'x'.repeat(1_000) }));

    const profile = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });

    assert.equal(profile.displayName, 'alice');
  });

  for (const state of [InstanceState.SUSPENDED, InstanceState.UNRESPONSIVE]) {
    test(`does not look up or write actors for a ${state} instance`, async () => {
      await createRemoteInstance({ state });
      const { context, lookupObject } = createLookupContext(async () => createActor());

      await assert.rejects(
        materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
        /Remote instance is unavailable/,
      );

      assert.equal(lookupObject.mock.calls.length, 0);
      assert.equal(await countRows(Profiles), 0);
    });
  }

  test('rechecks a remote instance suspended during lookup before storing an actor', async () => {
    const instance = await createRemoteInstance();
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => {
      markLookupStarted = resolve;
    });
    let releaseLookup!: () => void;
    const lookupReleased = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const { context } = createLookupContext(async () => {
      markLookupStarted();
      await lookupReleased;
      return createActor();
    });

    const materialization = materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
    });
    await lookupStarted;
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, instance.id));
    releaseLookup();

    await assert.rejects(materialization, /Remote instance is unavailable/);
    assert.equal(await countRows(Profiles), 0);
    assert.equal(await countRows(ActivityPubActors), 0);
  });

  test('does not treat an existing local instance as an ActivityPub instance', async () => {
    await createRemoteInstance({ kind: InstanceKind.LOCAL });
    const { context, lookupObject } = createLookupContext(async () => createActor());

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      /Remote instance is not an ActivityPub instance/,
    );

    assert.equal(lookupObject.mock.calls.length, 0);
    assert.equal(await countRows(Profiles), 0);
  });

  test('reuses an existing remote actor URI and refreshes published when present', async () => {
    const originalCreatedAt = Temporal.Instant.from('2020-01-01T00:00:00Z');
    const nextPublished = Temporal.Instant.from('2024-01-02T03:04:05Z');
    const stored = await createStoredRemoteActor({ createdAt: originalCreatedAt });
    const { context } = createLookupContext(async () =>
      createActor({
        name: 'Refreshed Alice',
        published: nextPublished,
        summary: '<p>Refreshed <a href="https://remote.example">Alice</a></p>',
      }),
    );

    const refreshed = await materializeRemoteProfileActor({
      context,
      actorUri: remoteActorUri,
      now: Temporal.Instant.from('2026-07-10T00:00:00Z'),
    });

    assert.equal(refreshed.id, stored.profile.id);
    assert.equal(refreshed.displayName, 'Refreshed Alice');
    assert.equal(refreshed.bio, 'Refreshed Alice');
    assert.equal(refreshed.state, ProfileState.ACTIVE);
    assert.equal(refreshed.createdAt.toString(), nextPublished.toString());

    const withoutPublished = createActor({ name: 'No Published', published: null });
    const { context: secondContext } = createLookupContext(async () => withoutPublished);
    const preserved = await materializeRemoteProfileActor({
      context: secondContext,
      actorUri: remoteActorUri,
      now: Temporal.Instant.from('2026-07-11T00:00:00Z'),
    });

    assert.equal(preserved.createdAt.toString(), nextPublished.toString());
  });

  test('keeps the newer actor refresh when an older lookup finishes later', async () => {
    const stored = await createStoredRemoteActor();
    const olderNow = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const newerNow = Temporal.Instant.from('2026-07-10T00:01:00Z');
    let markOlderLookupStarted!: () => void;
    const olderLookupStarted = new Promise<void>((resolve) => {
      markOlderLookupStarted = resolve;
    });
    let releaseOlderLookup!: () => void;
    const olderLookupReleased = new Promise<void>((resolve) => {
      releaseOlderLookup = resolve;
    });
    const { context: olderContext } = createLookupContext(async () => {
      markOlderLookupStarted();
      await olderLookupReleased;
      return createActor({
        icon: new Image({ url: new URL(`https://${remoteDomain}/media/avatar-older.png`) }),
        name: 'Older Alice',
      });
    });
    const { context: newerContext } = createLookupContext(async () =>
      createActor({
        icon: new Image({ url: new URL(`https://${remoteDomain}/media/avatar-newer.png`) }),
        name: 'Newer Alice',
      }),
    );

    const olderRefresh = materializeRemoteProfileActor({
      context: olderContext,
      actorUri: remoteActorUri,
      now: olderNow,
    });
    await olderLookupStarted;
    await materializeRemoteProfileActor({
      context: newerContext,
      actorUri: remoteActorUri,
      now: newerNow,
    });
    releaseOlderLookup();
    await olderRefresh;

    const persisted = await db
      .select({ actor: ActivityPubActors, profile: Profiles })
      .from(ActivityPubActors)
      .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
      .where(eq(Profiles.id, stored.profile.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(persisted.profile.displayName, 'Newer Alice');
    assert.equal(persisted.actor.lastFetchedAt?.toString(), newerNow.toString());
    assert.deepEqual(
      (await readProfileMedia(stored.profile.id)).map(({ kind, url }) => ({ kind, url })),
      [
        {
          kind: ProfileMediaKind.AVATAR,
          url: `https://${remoteDomain}/media/avatar-newer.png`,
        },
      ],
    );
  });

  test('rejects handle collisions when refreshing an existing actor URI', async () => {
    const stored = await createStoredRemoteActor();
    await createProfile({ handle: 'bob', instanceId: stored.instance.id });
    const { context } = createLookupContext(async () => createActor({ preferredUsername: 'bob' }));

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      /Remote actor handle collides with another actor/,
    );

    const profile = await db
      .select()
      .from(Profiles)
      .where(eq(Profiles.id, stored.profile.id))
      .limit(1)
      .then(firstOrThrow);
    assert.equal(profile.handle, 'alice');
  });

  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    test(`does not reactivate or update a ${state} remote profile`, async () => {
      const stored = await createStoredRemoteActor({ profileState: state });
      const { context, lookupObject } = createLookupContext(async () =>
        createActor({ name: 'Unexpected Refresh' }),
      );

      await assert.rejects(
        materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
        /Remote profile is unavailable/,
      );

      assert.equal(lookupObject.mock.calls.length, 1);
      const profile = await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, stored.profile.id))
        .limit(1)
        .then(firstOrThrow);
      assert.equal(profile.state, state);
      assert.equal(profile.displayName, 'alice');
    });
  }

  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    test(`returns NotFound for a stored ${state} profile without a remote lookup`, async () => {
      const stored = await createStoredRemoteActor({ profileState: state });
      await assert.rejects(
        findOrMaterializeRemoteProfileActor({
          actorUri: remoteActorUri,
        }),
        /Profile not found/,
      );

      const profile = await db
        .select()
        .from(Profiles)
        .where(eq(Profiles.id, stored.profile.id))
        .limit(1)
        .then(firstOrThrow);
      assert.equal(profile.state, state);
    });
  }

  test('rejects actor URI collisions with local profiles', async () => {
    const profile = await createProfile({ handle: 'local', instanceId: localInstanceId });
    const actor = createActor();
    await db.insert(ActivityPubActors).values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: actor.id!.href,
    });
    const { context } = createLookupContext(async () => actor);

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      /collides with a local actor/,
    );
  });

  test('rejects a local-origin actor URI before a local actor row exists', async () => {
    const actor = createActor({ id: new URL(`${publicOrigin}/ap/actors/alice`) });
    const { context } = createLookupContext(async () => actor);

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: actor.id! }),
      /Remote actor URI uses the local origin/,
    );

    assert.equal(await countRows(Profiles), 0);
    assert.equal(await countRows(ActivityPubActors), 0);
  });

  test('rejects a hostless canonical actor URI before creating an actor profile', async () => {
    const actor = createActor({ id: new URL('urn:example:alice') });
    const { context } = createLookupContext(async () => actor);

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: actor.id! }),
      /Remote actor URI must use HTTP\(S\) with a hostname/,
    );

    assert.equal(await countRows(Profiles), 0);
    assert.equal(await countRows(ActivityPubActors), 0);
    const emptyDomainInstance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.domain, ''))
      .limit(1)
      .then(first);
    assert.equal(emptyDomainInstance, undefined);
  });

  test('rejects handle collisions with a different actor URI', async () => {
    const instance = await createRemoteInstance();
    await createProfile({ handle: 'alice', instanceId: instance.id });
    const { context } = createLookupContext(async () => createActor());

    await assert.rejects(
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      /handle collides with another actor/,
    );
  });

  test('returns a stale profile after the refresh Workflow is durably started', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      lastFetchedAt: now.subtract({ hours: 8 * 24 }),
    });
    let releaseStart!: () => void;
    const startEntered = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    let signalStartCall!: () => void;
    const startCall = new Promise<void>((resolve) => {
      signalStartCall = resolve;
    });
    const start = mock.method(temporalClient.workflow, 'start', async () => {
      signalStartCall();
      await startEntered;
      return undefined as never;
    });
    const workflowResult = findOrMaterializeRemoteProfileActor({
      actorUri: remoteActorUri,
      mode: 'sync',
      now,
    });
    let profileSettled = false;
    void workflowResult.then(
      () => {
        profileSettled = true;
      },
      () => {
        profileSettled = true;
      },
    );

    try {
      await startCall;
      await setImmediate();
      assert.equal(profileSettled, false);
      releaseStart();
      const profile = await workflowResult;
      assert.equal(profile.id, stored.profile.id);
      assert.equal(start.mock.calls.length, 1);
      assert.equal(start.mock.calls[0]?.arguments[0], 'remoteProfileMaterializationWorkflow');
      const options = start.mock.calls[0]?.arguments[1];
      assert.ok(options);
      assert.deepEqual(options.args, [{ actorUri: stored.actor.uri }]);
    } finally {
      releaseStart();
      start.mock.restore();
    }
  });

  test('returns a fresh profile without starting a refresh Workflow', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      lastFetchedAt: now.subtract({ hours: 1 }),
    });
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    try {
      const profile = await findOrMaterializeRemoteProfileActor({
        actorUri: remoteActorUri,
        now,
      });

      assert.equal(profile.id, stored.profile.id);
      assert.equal(start.mock.calls.length, 0);
    } finally {
      start.mock.restore();
    }
  });

  test('keeps a stale profile when starting its refresh fails', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      lastFetchedAt: now.subtract({ hours: 8 * 24 }),
    });
    const start = mock.method(temporalClient.workflow, 'start', async () => {
      throw new Error('Temporal is unavailable');
    });
    const error = mock.method(console, 'error', () => undefined);

    try {
      const profile = await findOrMaterializeRemoteProfileActor({
        actorUri: remoteActorUri,
        mode: 'sync',
        now,
      });

      assert.equal(profile.id, stored.profile.id);
      assert.equal(start.mock.calls.length, 1);
      assert.equal(error.mock.calls.length, 1);
    } finally {
      error.mock.restore();
      start.mock.restore();
    }
  });

  test('returns stale profiles without refresh for unresponsive instances', async () => {
    const now = Temporal.Instant.from('2026-07-10T00:00:00Z');
    const stored = await createStoredRemoteActor({
      instanceState: InstanceState.UNRESPONSIVE,
      lastFetchedAt: now.subtract({ hours: 8 * 24 }),
    });
    const start = mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    const profile = await findOrMaterializeRemoteProfileActor({
      actorUri: remoteActorUri,
      now,
    });

    assert.equal(profile.id, stored.profile.id);
    assert.equal(start.mock.calls.length, 0);
    start.mock.restore();
  });

  test('waits for a missing remote Profile ID and reloads the stored row', async () => {
    const instance = await createRemoteInstance();
    const profile = await createProfile({ handle: 'alice', instanceId: instance.id });
    const execute = mock.method(
      temporalClient.workflow,
      'execute',
      async () => profile.id as never,
    );

    try {
      const result = await findOrMaterializeRemoteProfileActor({
        actorUri: remoteActorUri,
        mode: 'sync',
        profileId: '00000000-0000-8000-8000-000000000002',
      });

      assert.equal(result.id, profile.id);
      assert.equal(execute.mock.calls.length, 1);
      const options = execute.mock.calls[0]?.arguments[1];
      assert.ok(options);
      assert.deepEqual(options.args, [
        {
          actorUri: remoteActorUri.href,
          profileId: '00000000-0000-8000-8000-000000000002',
        },
      ]);
    } finally {
      execute.mock.restore();
    }
  });

  for (const [label, invalidate] of [
    [
      'inactive Profile',
      async (profileId: string, instanceId: string) => {
        await db
          .update(Profiles)
          .set({ state: ProfileState.DISABLED })
          .where(and(eq(Profiles.id, profileId), eq(Profiles.instanceId, instanceId)));
      },
    ],
    [
      'suspended Instance',
      async (_profileId: string, instanceId: string) => {
        await db
          .update(Instances)
          .set({ state: InstanceState.SUSPENDED })
          .where(eq(Instances.id, instanceId));
      },
    ],
  ] as const) {
    test(`does not return a ${label} after sync materialization`, async () => {
      const instance = await createRemoteInstance();
      const profile = await createProfile({ handle: 'bob', instanceId: instance.id });
      const execute = mock.method(temporalClient.workflow, 'execute', async () => {
        await invalidate(profile.id, instance.id);
        return profile.id as never;
      });

      try {
        await assert.rejects(
          findOrMaterializeRemoteProfileActor({
            actorUri: remoteActorUri,
            mode: 'sync',
          }),
          /Profile not found/,
        );
      } finally {
        execute.mock.restore();
      }
    });
  }

  test('rehydrates non-retryable materialization errors from the Workflow', async () => {
    const execute = mock.method(temporalClient.workflow, 'execute', async () => {
      throw ApplicationFailure.nonRetryable(
        'Remote lookup did not return an actor.',
        'RemoteActorMaterializationError',
      );
    });

    try {
      await assert.rejects(
        findOrMaterializeRemoteProfileActor({ actorUri: remoteActorUri, mode: 'sync' }),
        (error: unknown) =>
          error instanceof RemoteActorMaterializationError &&
          error.message === 'Remote lookup did not return an actor.',
      );
      assert.equal(execute.mock.calls.length, 1);
    } finally {
      execute.mock.restore();
    }
  });

  test('rejects stored profiles from suspended instances', async () => {
    await createStoredRemoteActor({ instanceState: InstanceState.SUSPENDED });
    await assert.rejects(
      findOrMaterializeRemoteProfileActor({
        actorUri: remoteActorUri,
      }),
      /Profile not found/,
    );
  });

  test('recovers concurrent first materialization as one remote identity', async () => {
    const actor = createActor({
      icon: new Image({
        mediaType: 'image/png',
        url: new URL(`https://${remoteDomain}/alice/avatar.png`),
      }),
    });
    let lookupCount = 0;
    let releaseLookups!: () => void;
    const bothLookupsStarted = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const { context } = createLookupContext(async () => {
      lookupCount += 1;
      if (lookupCount === 2) {
        releaseLookups();
      }
      await bothLookupsStarted;
      return actor;
    });

    const [firstProfile, secondProfile] = await Promise.all([
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
      materializeRemoteProfileActor({ context, actorUri: remoteActorUri }),
    ]);

    assert.equal(firstProfile.id, secondProfile.id);
    assert.equal(await countRows(Profiles), 1);
    assert.equal(await countRows(ActivityPubActors), 1);
    const profileMedia = await readProfileMedia(firstProfile.id);
    assert.deepEqual(profileMedia, [
      {
        altText: null,
        kind: ProfileMediaKind.AVATAR,
        mediaType: 'image/png',
        source: MediaSource.REMOTE,
        state: MediaState.READY,
        url: `https://${remoteDomain}/alice/avatar.png`,
      },
    ]);
  });

  test('matches the remote actor Drizzle schema in PostgreSQL', async () => {
    const columns = await pg<
      Array<{ column_name: string; is_nullable: 'YES' | 'NO' }>
    >`SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'activitypub_actor'
        AND column_name IN (
          'inbox_uri',
          'outbox_uri',
          'followers_uri',
          'following_uri',
          'shared_inbox_uri',
          'last_fetched_at',
          'profile_url'
        )
      ORDER BY column_name`;

    assert.deepEqual(
      columns.map((column) => [column.column_name, column.is_nullable]),
      [
        ['followers_uri', 'YES'],
        ['following_uri', 'YES'],
        ['inbox_uri', 'YES'],
        ['last_fetched_at', 'YES'],
        ['outbox_uri', 'YES'],
        ['profile_url', 'YES'],
        ['shared_inbox_uri', 'YES'],
      ],
    );

    const enumValues = await pg<Array<{ enumlabel: string }>>`
      SELECT enumlabel
      FROM pg_enum
      INNER JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'activitypub_actor_type'
      ORDER BY enumsortorder
    `;

    assert.deepEqual(
      enumValues.map((row) => row.enumlabel),
      Object.values(ActivityPubActorType),
    );

    const mediaIndexes = await pg<Array<{ indexdef: string; indexname: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'media'
        AND indexname IN ('media_remote_profile_url_unique', 'media_remote_url_unique')
      ORDER BY indexname
    `;

    assert.deepEqual([...mediaIndexes], []);
  });
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

const readProfileMedia = (profileId: string) =>
  db
    .select({
      altText: Media.altText,
      kind: ProfileMedia.kind,
      mediaType: Media.mediaType,
      source: Media.source,
      state: Media.state,
      url: Media.url,
    })
    .from(ProfileMedia)
    .innerJoin(Media, eq(Media.id, ProfileMedia.mediaId))
    .where(eq(ProfileMedia.profileId, profileId))
    .orderBy(ProfileMedia.kind);

const createLookupContext = (
  implementation: (
    identifier: string | URL,
    options?: NonNullable<Parameters<Context<void>['lookupObject']>[1]>,
  ) => Promise<ActivityPubObject | null>,
) => {
  const lookupObject = mock.fn(implementation);

  return {
    context: {
      lookupObject: lookupObject as unknown as Context<void>['lookupObject'],
    },
    lookupObject,
  };
};

const createRemoteInstance = async ({
  domain = remoteDomain,
  kind = InstanceKind.ACTIVITYPUB,
  state = InstanceState.ACTIVE,
}: { domain?: string; kind?: InstanceKind; state?: InstanceState } = {}) =>
  db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind,
      state,
    })
    .returning()
    .then(firstOrThrow);

const createProfile = async ({
  createdAt,
  handle,
  instanceId,
  state = ProfileState.ACTIVE,
}: {
  createdAt?: Temporal.Instant;
  handle: string;
  instanceId: string;
  state?: ProfileState;
}) =>
  db
    .insert(Profiles)
    .values({
      createdAt,
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle.toLowerCase(),
      state,
    })
    .returning()
    .then(firstOrThrow);

const createStoredRemoteActor = async ({
  createdAt = Temporal.Instant.from('2020-01-01T00:00:00Z'),
  instanceState = InstanceState.ACTIVE,
  lastFetchedAt = Temporal.Instant.from('2026-07-09T00:00:00Z'),
  profileState = ProfileState.ACTIVE,
}: {
  createdAt?: Temporal.Instant;
  instanceState?: InstanceState;
  lastFetchedAt?: Temporal.Instant | null;
  profileState?: ProfileState;
} = {}) => {
  const instance = await createRemoteInstance({ state: instanceState });
  const profile = await createProfile({
    createdAt,
    handle: 'alice',
    instanceId: instance.id,
    state: profileState,
  });
  const actor = await db
    .insert(ActivityPubActors)
    .values({
      lastFetchedAt,
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: `https://${remoteDomain}/users/alice`,
    })
    .returning()
    .then(firstOrThrow);

  return { actor, instance, profile };
};

const countRows = async (table: typeof Profiles | typeof ActivityPubActors | typeof Instances) =>
  db
    .select({ value: count() })
    .from(table)
    .then(firstOrThrow)
    .then((row) => row.value);

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
