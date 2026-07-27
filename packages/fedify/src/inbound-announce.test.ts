import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { generateCryptoKeyPair, signRequest } from '@fedify/fedify';
import { Announce, CryptographicKey, Person, Undo } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { and, eq, ne } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as FederationModule from './federation';
import type { handleInboundAnnounce as HandleInboundAnnounce } from './inbound-announce';
import type { handleInboundUndo as HandleInboundUndo } from './inbound-follow';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const actorUri = new URL('https://remote.example/users/alice');
const otherActorUri = new URL('https://other.example/users/mallory');
const sourceUri = new URL('https://source.example/notes/1');
const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const receivedAt = Temporal.Instant.from('2026-07-27T00:00:00Z');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let Profiles: typeof CoreDb.Profiles;
let federation: typeof FederationModule.federation;
let handleInboundAnnounce: typeof HandleInboundAnnounce;
let handleInboundUndo: typeof HandleInboundUndo;
let localInstanceId: string;

describe('inbound Announce materialization', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      pg,
      PostContents,
      Posts,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ handleInboundAnnounce } = await import('./inbound-announce'));
    ({ handleInboundUndo } = await import('./inbound-follow'));
    ({ federation } = await import('./federation'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await db.delete(Profiles);
    await db.delete(Instances).where(ne(Instances.id, localInstanceId));
  });

  after(async () => {
    await db.update(Posts).set({ currentContentId: null });
    await db.delete(PostContents);
    await db.delete(Posts);
    await pg.end();
  });

  test('materializes a direct Repost and stores the Announce as its current ActivityPub identity', async () => {
    const actor = await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    const activity = announce('announce-a', sourceUri);

    await handleInboundAnnounce(context(), activity, receivedAt);

    const { mapping, repost } = await currentRepost(activity.id!);
    assert.equal(repost.profileId, actor.id);
    assert.equal(repost.repostSourceId, source.id);
    assert.equal(repost.currentContentId, null);
    assert.equal(repost.visibility, PostVisibility.UNLISTED);
    assert.equal(repost.state, PostState.ACTIVE);
    assert.equal(mapping.receivedAt.toString(), receivedAt.toString());
  });

  test('accepts an exact canonical local Note URI without an ActivityPub mapping', async () => {
    const actor = await createRemoteActor(actorUri);
    const localAuthor = await createProfile({ instanceId: localInstanceId, handle: 'local' });
    const source = await createLocalSource(localAuthor.id);

    await handleInboundAnnounce(
      context(),
      announce('local-source', new URL(`/ap/note/${source.id}`, publicOrigin)),
      receivedAt,
    );

    const repost = await findReposts(actor.id, source.id).then((rows) => rows[0]);
    assert.equal(repost?.state, PostState.ACTIVE);
  });

  test('ignores unknown identities, non-exact targets, and inadmissible nested Repost sources', async () => {
    await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    const nested = await db
      .insert(Posts)
      .values({
        profileId: source.profileId,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    await db.insert(ActivityPubPosts).values({
      postId: nested.id,
      publishedAt: null,
      receivedAt,
      uri: 'https://source.example/notes/nested',
    });

    const invalid = [
      new Announce({ actor: actorUri, object: sourceUri }),
      new Announce({
        id: new URL('https://evil.example/activities/1'),
        actor: actorUri,
        object: sourceUri,
      }),
      announce('unknown-target', new URL('https://source.example/notes/unknown')),
      announce('nested-target', new URL('https://source.example/notes/nested')),
      announce('fake-local-target', new URL(`/ap/note/${source.id}`, publicOrigin)),
      announce('local-query', new URL(`/ap/note/${source.id}?alias=1`, publicOrigin)),
    ];

    for (const activity of invalid) {
      await handleInboundAnnounce(context(), activity, receivedAt);
    }

    const nonHttpObjectUri = new URL('ftp://source.example/notes/1');
    await db
      .update(ActivityPubPosts)
      .set({ uri: nonHttpObjectUri.href })
      .where(eq(ActivityPubPosts.postId, source.id));
    await handleInboundAnnounce(
      context(),
      announce('non-http-object', nonHttpObjectUri),
      receivedAt,
    );

    assert.equal(await findRepostsByActor(actorUri).then((rows) => rows.length), 0);
  });

  test('deduplicates repeated and concurrent delivery of the same Announce', async () => {
    const actor = await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    const activity = announce('same', sourceUri);

    await Promise.all(Array.from({ length: 4 }, () => handleInboundAnnounce(context(), activity)));
    await handleInboundAnnounce(context(), activity);

    assert.equal((await findReposts(actor.id, source.id)).length, 1);
    assert.equal(
      (await db.select().from(ActivityPubPosts).where(eq(ActivityPubPosts.uri, activity.id!.href)))
        .length,
      1,
    );
  });

  test('rolls back when the Announce URI belongs to another Post', async () => {
    const actor = await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    const activity = announce('uri-collision', sourceUri);
    const collision = await createPost({
      document: postContentDocumentFromText('collision'),
      objectUri: activity.id!.href,
      origin: 'ACTIVITYPUB',
      profileId: source.profileId,
      publishedAt: null,
      receivedAt,
      visibility: PostVisibility.PUBLIC,
    });
    assert.equal(collision.created, true);

    await handleInboundAnnounce(context(), activity);

    assert.equal((await findReposts(actor.id, source.id)).length, 0);
    assert.equal(
      await db
        .select({ postId: ActivityPubPosts.postId })
        .from(ActivityPubPosts)
        .where(eq(ActivityPubPosts.uri, activity.id!.href))
        .then(firstOrThrow)
        .then(({ postId }) => postId),
      collision.post.id,
    );
  });

  test('does not materialize a remote-only visibility source the actor cannot view', async () => {
    const actor = await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    await db
      .update(Posts)
      .set({ visibility: PostVisibility.FOLLOWERS })
      .where(eq(Posts.id, source.id));

    await handleInboundAnnounce(context(), announce('hidden-source', sourceUri));

    assert.equal((await findReposts(actor.id, source.id)).length, 0);
  });

  test('routes signed personal and shared deliveries through the production listener to one Repost', async () => {
    const actor = await createRemoteActor(actorUri);
    const source = await createRemoteSource();
    await createProfile({ id: localProfileId, instanceId: localInstanceId, handle: 'local-inbox' });
    const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const remoteKeyUri = new URL('#main-key', actorUri);
    const remoteKey = new CryptographicKey({
      id: remoteKeyUri,
      owner: actorUri,
      publicKey: remoteKeyPair.publicKey,
    });
    const remoteActor = new Person({ id: actorUri, publicKey: remoteKey });
    const documents = new Map<string, unknown>([
      [actorUri.href, await remoteActor.toJsonLd({ format: 'expand' })],
      [remoteKeyUri.href, await remoteKey.toJsonLd({ format: 'expand' })],
    ]);
    const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      const document = documents.get(url);
      if (!document) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }
      return new Response(JSON.stringify(document), {
        headers: { 'content-type': 'application/activity+json' },
      });
    });
    const contextLoader = getDocumentLoader();
    const activity = announce('signed-both', sourceUri);
    const createSignedRequest = async (path: string) =>
      signRequest(
        new Request(new URL(path, publicOrigin), {
          body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
          headers: { 'content-type': 'application/activity+json' },
          method: 'POST',
        }),
        remoteKeyPair.privateKey,
        remoteKeyUri,
      );

    try {
      const [personal, shared] = await Promise.all([
        federation.fetch(await createSignedRequest(`/ap/actor/${localProfileId}/inbox`), {
          contextData: undefined,
        }),
        federation.fetch(await createSignedRequest('/inbox'), { contextData: undefined }),
      ]);

      assert.equal(personal.status, 202, await personal.text());
      assert.equal(shared.status, 202, await shared.text());
      assert.equal((await findReposts(actor.id, source.id)).length, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('moves current identities across generations and ignores a repeated Undo after B is superseded', async () => {
    const actor = await createRemoteActor(actorUri);
    await createRemoteSource();
    const a = announce('a', sourceUri);
    const b = announce('b', sourceUri);

    await handleInboundAnnounce(context(), a);
    const original = await currentRepost(a.id!).then(({ repost }) => repost);
    await handleInboundAnnounce(context(), b);
    assert.equal(await currentRepost(b.id!).then(({ repost }) => repost.id), original.id);

    await handleInboundUndo(context(), undo(actorUri, a.id!));
    assert.equal(await postState(original.id), PostState.ACTIVE);
    await handleInboundUndo(context(), undo(actorUri, b.id!));
    assert.equal(await postState(original.id), PostState.DELETED);

    await handleInboundAnnounce(context(), b);
    const recreated = await currentRepost(b.id!).then(({ repost }) => repost);
    assert.notEqual(recreated.id, original.id);
    assert.equal(recreated.profileId, actor.id);

    const c = announce('c', sourceUri);
    await handleInboundAnnounce(context(), c);
    assert.equal(await currentRepost(c.id!).then(({ repost }) => repost.id), recreated.id);

    await handleInboundUndo(context(), undo(actorUri, b.id!));
    assert.equal(await postState(recreated.id), PostState.ACTIVE);
  });

  test('ignores Undo from another actor and converges under concurrent B and Undo A', async () => {
    const actor = await createRemoteActor(actorUri);
    await createRemoteActor(otherActorUri, 'mallory');
    const source = await createRemoteSource();
    const a = announce('race-a', sourceUri);
    const b = announce('race-b', sourceUri);

    await handleInboundAnnounce(context(), a);
    const original = await currentRepost(a.id!).then(({ repost }) => repost);
    await handleInboundUndo(context(), undo(otherActorUri, a.id!));
    assert.equal(await postState(original.id), PostState.ACTIVE);

    await Promise.all([
      handleInboundAnnounce(context(), b),
      handleInboundUndo(context(), undo(actorUri, a.id!)),
    ]);

    const { repost } = await currentRepost(b.id!);
    assert.equal(repost.state, PostState.ACTIVE);
    assert.equal(repost.profileId, actor.id);
    assert.equal(repost.repostSourceId, source.id);
    assert.equal(
      (await findReposts(actor.id, source.id)).filter(({ state }) => state === PostState.ACTIVE)
        .length,
      1,
    );
  });
});

const context = () =>
  ({
    documentLoader: async (url: string) => {
      throw new Error(`Unexpected document URL: ${url}`);
    },
  }) as unknown as InboxContext<void>;

const announce = (id: string, object: URL) =>
  new Announce({
    actor: actorUri,
    id: new URL(`/activities/${id}`, actorUri),
    object,
    published: receivedAt,
  });

const undo = (actor: URL, activity: URL) =>
  new Undo({
    actor,
    id: new URL(`/activities/undo-${crypto.randomUUID()}`, actor),
    object: activity,
  });

const createRemoteActor = async (uri: URL, handle = 'alice') => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: uri.origin,
      domain: uri.hostname,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await createProfile({ instanceId: instance.id, handle });
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: uri.href,
  });
  return profile;
};

const createProfile = async ({
  id,
  instanceId,
  handle,
}: {
  id?: string;
  instanceId: string;
  handle: string;
}) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      id,
      instanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createRemoteSource = async () => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: sourceUri.origin,
      domain: sourceUri.hostname,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const author = await createProfile({ instanceId: instance.id, handle: 'source-author' });
  const result = await createPost({
    document: postContentDocumentFromText('source'),
    objectUri: sourceUri.href,
    origin: 'ACTIVITYPUB',
    profileId: author.id,
    publishedAt: null,
    receivedAt,
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(result.created, true);
  return result.post;
};

const createLocalSource = async (profileId: string) =>
  createPost({
    document: postContentDocumentFromText('local source'),
    origin: 'LOCAL',
    profileId,
    visibility: PostVisibility.PUBLIC,
  }).then(({ post }) => post);

const currentRepost = async (activityUri: URL) => {
  const mapping = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, activityUri.href))
    .then(firstOrThrow);
  const repost = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, mapping.postId))
    .then(firstOrThrow);
  return { mapping, repost };
};

const findReposts = (profileId: string, sourcePostId: string) =>
  db
    .select()
    .from(Posts)
    .where(and(eq(Posts.profileId, profileId), eq(Posts.repostSourceId, sourcePostId)));

const findRepostsByActor = async (uri: URL) => {
  const actor = await db
    .select({ profileId: ActivityPubActors.profileId })
    .from(ActivityPubActors)
    .where(eq(ActivityPubActors.uri, uri.href))
    .then(firstOrThrow);
  return db.select().from(Posts).where(eq(Posts.profileId, actor.profileId));
};

const postState = (postId: string) =>
  db
    .select({ state: Posts.state })
    .from(Posts)
    .where(eq(Posts.id, postId))
    .then(firstOrThrow)
    .then(({ state }) => state);
