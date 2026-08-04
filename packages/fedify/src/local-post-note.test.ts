import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
} from '@fedify/fedify';
import {
  CryptographicKey,
  EmojiReact,
  Image,
  Like,
  Note,
  Object as ActivityObject,
  Person,
  PUBLIC_COLLECTION,
} from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { RequestContext } from '@fedify/fedify';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as PostUriModule from './activitypub-post-uri';
import type * as LocalPostNoteModule from './local-post-note';
import type * as LocalPostReactionCollectionModule from './local-post-reaction-collection';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteActorUri = new URL('https://prod-494.remote.example/users/follower');
const remoteKeyUri = new URL('#main-key', remoteActorUri);

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubReactions: typeof CoreDb.ActivityPubReactions;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let authorizeLocalPostNote: typeof LocalPostNoteModule.authorizeLocalPostNote;
let db: typeof CoreDb.db;
let dispatchLocalPostNote: typeof LocalPostNoteModule.dispatchLocalPostNote;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let isCanonicalPostId: typeof PostUriModule.isCanonicalPostId;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let resolveActivityPubPostUri: typeof PostUriModule.resolveActivityPubPostUri;
let countLocalPostEmojiReactions: typeof LocalPostReactionCollectionModule.countLocalPostEmojiReactions;
let dispatchLocalPostEmojiReactions: typeof LocalPostReactionCollectionModule.dispatchLocalPostEmojiReactions;
let firstLocalPostEmojiReactionsCursor: typeof LocalPostReactionCollectionModule.firstLocalPostEmojiReactionsCursor;
let testInstanceIds: string[] = [];
let testAccountIds: string[] = [];
let testProfileIds: string[] = [];

describe('ActivityPub Local Post Note', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      ActivityPubActors,
      ActivityPubReactions,
      Accounts,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      Media,
      pg,
      PostContents,
      Posts,
      ProfileFollowRequests,
      ProfileFollows,
      Profiles,
      Reactions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ isCanonicalPostId, resolveActivityPubPostUri } = await import('./activitypub-post-uri'));
    ({ authorizeLocalPostNote, dispatchLocalPostNote } = await import('./local-post-note'));
    ({
      countLocalPostEmojiReactions,
      dispatchLocalPostEmojiReactions,
      firstLocalPostEmojiReactionsCursor,
    } = await import('./local-post-reaction-collection'));
    const { localInstance } = await seedDatabase({ publicOrigin });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await cleanTestRows();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  after(async () => {
    await cleanTestRows();
    await pg.end();
  });

  test('derives Local identity and reuses only stored Remote identity', async () => {
    const localAuthor = await createProfile({ kind: InstanceKind.LOCAL });
    const remoteAuthor = await createProfile({ domain: 'remote.example' });
    const localPost = await createPost(localAuthor.id);
    const remotePost = await createPost(remoteAuthor.id);
    const unmappedRemotePost = await createPost(remoteAuthor.id);
    const remoteUri = new URL('https://remote.example/notes/1');
    await db.insert(ActivityPubPosts).values({
      postId: remotePost.id,
      receivedAt: Temporal.Instant.from('2026-07-27T00:00:00Z'),
      uri: remoteUri.href,
    });

    const storedCanonicalOrigin = 'https://stored-origin.example';
    await db
      .update(Instances)
      .set({ canonicalOrigin: storedCanonicalOrigin })
      .where(eq(Instances.id, localInstanceId));
    try {
      assert.equal(
        (await resolveActivityPubPostUri(localPost.id))?.href,
        `${storedCanonicalOrigin}/ap/note/${localPost.id}`,
      );
    } finally {
      await db
        .update(Instances)
        .set({ canonicalOrigin: publicOrigin })
        .where(eq(Instances.id, localInstanceId));
    }
    assert.equal((await resolveActivityPubPostUri(remotePost.id))?.href, remoteUri.href);
    assert.equal(await resolveActivityPubPostUri(unmappedRemotePost.id), undefined);
    assert.equal((await db.select().from(ActivityPubPosts)).length, 1);
  });

  test('projects audience, escaped summary, canonical Web URL, and stable Parent identities', async () => {
    const author = await createProfile({ handle: 'author', kind: InstanceKind.LOCAL });
    const remoteAuthor = await createProfile({ domain: 'remote.example' });
    const localParent = await createPost(author.id);
    const remoteParent = await createPost(remoteAuthor.id);
    const followersParent = await createPost(author.id, {
      visibility: PostVisibility.FOLLOWERS,
    });
    const remoteParentUri = new URL('https://remote.example/notes/parent');
    await db.insert(ActivityPubPosts).values({
      postId: remoteParent.id,
      receivedAt: Temporal.Instant.from('2026-07-27T00:00:00Z'),
      uri: remoteParentUri.href,
    });
    const publicReply = await createPost(author.id, {
      replyParentId: localParent.id,
      summary: '<script>alert(1)</script>',
    });
    const unlistedReply = await createPost(author.id, {
      replyParentId: remoteParent.id,
      visibility: PostVisibility.UNLISTED,
    });
    const followersParentReply = await createPost(author.id, {
      replyParentId: followersParent.id,
    });
    const rootPost = await createPost(author.id);
    const context = createContext();
    const publicNote = await dispatchLocalPostNote(context, { id: publicReply.id });
    const unlistedNote = await dispatchLocalPostNote(context, { id: unlistedReply.id });
    const followersParentNote = await dispatchLocalPostNote(context, {
      id: followersParentReply.id,
    });
    const rootNote = await dispatchLocalPostNote(context, { id: rootPost.id });
    const followersUri = `${publicOrigin}/ap/actor/${author.id}/followers`;

    assert.ok(publicNote);
    assert.equal(publicNote.id?.href, `${publicOrigin}/ap/note/${publicReply.id}`);
    assert.equal(
      publicNote.emojiReactionsId?.href,
      `${publicOrigin}/ap/note/${publicReply.id}/emoji-reactions`,
    );
    assert.match(JSON.stringify(await publicNote.toJsonLd()), /"emojiReactions":/);
    assert.equal(publicNote.attributionId?.href, `${publicOrigin}/ap/actor/${author.id}`);
    assert.equal(publicNote.replyTargetId?.href, `${publicOrigin}/ap/note/${localParent.id}`);
    assert.equal(publicNote.toId?.href, PUBLIC_COLLECTION.href);
    assert.equal(publicNote.ccId?.href, followersUri);
    assert.equal(publicNote.summary?.toString(), '&lt;script&gt;alert(1)&lt;/script&gt;');
    const webPostId = publicNote.url
      ? new URL(publicNote.url.toString()).pathname.split('/').at(-1)
      : undefined;
    assert.ok(webPostId);
    const webPostIdPayload = Buffer.from(webPostId, 'base64url');
    assert.equal(
      webPostIdPayload.subarray(0, 16).toString('hex'),
      publicReply.id.replaceAll('-', ''),
    );
    assert.equal(webPostIdPayload.subarray(16).toString('ascii'), 'Post');
    assert.equal(publicNote.url?.toString(), `${publicOrigin}/@author/${webPostId}`);

    assert.ok(unlistedNote);
    assert.equal(unlistedNote.replyTargetId?.href, remoteParentUri.href);
    assert.equal(unlistedNote.toId?.href, followersUri);
    assert.equal(unlistedNote.ccId?.href, PUBLIC_COLLECTION.href);
    assert.equal(
      followersParentNote?.replyTargetId?.href,
      `${publicOrigin}/ap/note/${followersParent.id}`,
    );
    assert.equal(rootNote?.replyTargetId, null);

    await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, localParent.id));
    const tombstoneParentNote = await dispatchLocalPostNote(createContext(), {
      id: publicReply.id,
    });
    assert.equal(
      tombstoneParentNote?.replyTargetId?.href,
      `${publicOrigin}/ap/note/${localParent.id}`,
    );
  });

  test('projects stored ordered Ready Local Media as Image attachments without HTML duplication or network reads', async () => {
    const author = await createProfile({ handle: 'media-author', kind: InstanceKind.LOCAL });
    const firstMedia = await createMedia(author.id, {
      mediaType: 'image/avif',
      url: 'https://cdn.example/media/first',
      storageReference: 'provider-opaque-reference-1',
    });
    const secondMedia = await createMedia(author.id, {
      url: 'https://cdn.example/media/second',
      storageReference: 'provider/opaque?reference=2',
    });
    const networkRead = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Media projection must use stored representation metadata');
    });
    const post = await createPost(author.id, {
      media: [
        { altText: '', mediaId: secondMedia.id },
        { altText: '첫 번째 설명', mediaId: firstMedia.id },
      ],
      sensitiveMedia: true,
    });

    const note = await dispatchLocalPostNote(createContext(), { id: post.id });
    assert.ok(note);
    assert.equal(note.content?.toString(), '<p>body</p>');
    assert.equal(note.content?.toString().includes('<img'), false);
    assert.equal(note.sensitive, true);

    const attachments: Image[] = [];
    for await (const attachment of note.getAttachments()) {
      assert.ok(attachment instanceof Image);
      attachments.push(attachment);
    }
    assert.equal(attachments.length, 2);
    assert.equal(attachments[0]?.url?.toString(), 'https://cdn.example/media/second');
    assert.equal(attachments[0]?.mediaType, 'image/webp');
    assert.equal(attachments[0]?.name?.toString(), '');
    assert.equal(attachments[1]?.url?.toString(), 'https://cdn.example/media/first');
    assert.equal(attachments[1]?.mediaType, 'image/avif');
    assert.equal(attachments[1]?.name?.toString(), '첫 번째 설명');
    assert.equal(networkRead.mock.callCount(), 0);

    const json = JSON.stringify(await note.toJsonLd());
    assert.equal(json.includes(firstMedia.id), false);
    assert.equal(json.includes(secondMedia.id), false);
  });

  test('does not project a partial Note when required Media is unavailable', async () => {
    const author = await createProfile({ handle: 'unavailable-media', kind: InstanceKind.LOCAL });
    const uploading = await createMedia(author.id, { state: MediaState.UPLOADING });
    const remote = await createMedia(author.id, { source: MediaSource.REMOTE });
    const malformed = await createMedia(author.id, { url: 'not-a-url' });
    const nonHttp = await createMedia(author.id, { url: 'data:image/png;base64,AA==' });
    const missingId = crypto.randomUUID();
    const networkRead = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Unavailable stored metadata must not trigger a network read');
    });

    for (const mediaId of [uploading.id, remote.id, malformed.id, nonHttp.id, missingId]) {
      const post = await createPost(author.id, { media: [{ altText: null, mediaId }] });
      assert.equal(await dispatchLocalPostNote(createContext(), { id: post.id }), null);
    }
    assert.equal(networkRead.mock.callCount(), 0);
  });

  test('returns the same unavailable boundary for unsupported or ineligible Posts', async () => {
    const localAuthor = await createProfile({ kind: InstanceKind.LOCAL });
    const inactiveAuthor = await createProfile({
      handle: 'inactive',
      kind: InstanceKind.LOCAL,
      state: ProfileState.SUSPENDED,
    });
    const remoteAuthor = await createProfile({ domain: 'remote.example' });
    const deleted = await createPost(localAuthor.id, { state: PostState.DELETED });
    const direct = await createPost(localAuthor.id, { visibility: PostVisibility.DIRECT });
    const remote = await createPost(remoteAuthor.id);
    const inactiveAuthorPost = await createPost(inactiveAuthor.id);
    const contentless = await db
      .insert(Posts)
      .values({
        profileId: localAuthor.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const context = createContext();

    for (const id of [deleted.id, direct.id, remote.id, inactiveAuthorPost.id, contentless.id]) {
      assert.equal(await dispatchLocalPostNote(context, { id }), null);
    }
    assert.equal(
      await dispatchLocalPostNote(context, {
        id: '00000000-0000-8000-8000-000000000099',
      }),
      null,
    );
    assert.equal(await dispatchLocalPostNote(context, { id: 'not-a-uuid' }), null);
    assert.equal(isCanonicalPostId('019F6F67-ABCD-7777-8888-ABCDEFABCDEF'), false);

    const inactiveInstancePost = await createPost(localAuthor.id);
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, localInstanceId));
    try {
      assert.equal(
        await dispatchLocalPostNote(createContext(), { id: inactiveInstancePost.id }),
        null,
      );
    } finally {
      await db
        .update(Instances)
        .set({ state: InstanceState.ACTIVE })
        .where(eq(Instances.id, localInstanceId));
    }
  });

  test('allows only Author or established Follower signed fetch', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const followersPost = await createPost(author.id, { visibility: PostVisibility.FOLLOWERS });
    const remoteFollower = await createProfile({ domain: 'remote.example' });
    const signedFixture = await createSignedFederation();

    const unknownActor = await signedFixture.fetch(followersPost.id);
    assert.equal(unknownActor.status, 404);

    await db.insert(ActivityPubActors).values({
      profileId: remoteFollower.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    });

    const denied = await signedFixture.fetch(followersPost.id);
    assert.equal(denied.status, 404);

    await db.insert(ProfileFollowRequests).values({
      followeeProfileId: author.id,
      followerProfileId: remoteFollower.id,
    });
    const pending = await signedFixture.fetch(followersPost.id);
    assert.equal(pending.status, 404);

    await db.delete(ProfileFollowRequests);
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: remoteFollower.id,
    });
    const allowedRequest = await signedFixture.createRequest(followersPost.id);
    const allowed = await signedFixture.federation.fetch(allowedRequest, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).content, '<p>body</p>');

    await db
      .update(Instances)
      .set({ state: InstanceState.UNRESPONSIVE })
      .where(eq(Instances.id, remoteFollower.instanceId));
    assert.equal((await signedFixture.fetch(followersPost.id)).status, 200);

    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, remoteFollower.instanceId));
    assert.equal((await signedFixture.fetch(followersPost.id)).status, 404);

    await db.delete(ProfileFollows);
    const anonymous = await signedFixture.federation.fetch(
      new Request(`${publicOrigin}/ap/note/${followersPost.id}`, {
        headers: { accept: 'application/activity+json' },
      }),
      {
        contextData: undefined,
        onUnauthorized: () => new Response('Not found', { status: 404 }),
      },
    );
    assert.equal(anonymous.status, 404);
  });

  test('allows the local Author identity without requiring a Follow row', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const followersPost = await createPost(author.id, { visibility: PostVisibility.FOLLOWERS });
    const context = Object.assign(Object.create(createContext()) as RequestContext<void>, {
      getSignedKeyOwner: async () =>
        new Person({ id: new URL(`/ap/actor/${author.id}`, publicOrigin) }),
    });

    assert.equal(await authorizeLocalPostNote(context, { id: followersPost.id }), true);
  });

  test('authorizes Followers Only access before resolving Media representations', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const media = await createMedia(author.id, { storageReference: 'opaque-media' });
    const followersPost = await createPost(author.id, {
      media: [{ altText: null, mediaId: media.id }],
      visibility: PostVisibility.FOLLOWERS,
    });
    const mediaLookup = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Media representation must not be resolved during authorization');
    });

    assert.equal(await authorizeLocalPostNote(createContext(), { id: followersPost.id }), false);
    assert.equal(mediaLookup.mock.callCount(), 0);
  });

  test('projects Local and stored Remote reactions with the eligible Activity vocabulary', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const localPost = await createPost(author.id);
    const remoteProfile = await createProfile({ domain: 'remote.example' });
    const remoteActor = new URL('https://remote.example/users/reactor');
    await db.insert(ActivityPubActors).values({
      profileId: remoteProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActor.href,
    });

    const localReaction = await createReaction(author.id, localPost.id, '❤️', {
      createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
    });
    await createReaction(remoteProfile.id, localPost.id, '🎉', {
      activityUri: 'https://remote.example/activities/reaction-1',
      createdAt: Temporal.Instant.from('2026-08-01T00:01:00Z'),
    });
    await createReaction(remoteProfile.id, localPost.id, '👀', {
      activityUri: 'not-a-url',
      createdAt: Temporal.Instant.from('2026-08-01T00:02:00Z'),
    });
    await createReaction(remoteProfile.id, localPost.id, '☘️', {
      createdAt: Temporal.Instant.from('2026-08-01T00:03:00Z'),
    });
    const networkRead = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Collection projection must not fetch remote identities');
    });
    const context = createContext();
    const page = await dispatchLocalPostEmojiReactions(context, { id: localPost.id }, null);

    assert.ok(page);
    assert.equal(page.items.length, 2);
    assert.ok(page.items[0] instanceof EmojiReact);
    assert.ok(page.items[1] instanceof Like);
    assert.equal(page.items[0]?.id?.href, 'https://remote.example/activities/reaction-1');
    assert.equal(page.items[0]?.actorId?.href, remoteActor.href);
    assert.equal(page.items[0]?.objectId?.href, `${publicOrigin}/ap/note/${localPost.id}`);
    assert.equal(page.items[1]?.id?.href, `${publicOrigin}/ap/reaction/${localReaction.id}`);
    assert.equal(page.items[1]?.actorId?.href, `${publicOrigin}/ap/actor/${author.id}`);
    assert.equal(await countLocalPostEmojiReactions(context, { id: localPost.id }), 2);
    assert.equal(networkRead.mock.callCount(), 0);

    await db.update(Reactions).set({ type: 'custom' }).where(eq(Reactions.id, localReaction.id));
    assert.equal(
      (await dispatchLocalPostEmojiReactions(createContext(), { id: localPost.id }, null))?.items
        .length,
      1,
    );
    assert.equal(await countLocalPostEmojiReactions(createContext(), { id: localPost.id }), 1);
  });

  test('uses the reacting Local Instance identity for all six reaction types', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    const reactorInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://reactor.local.example',
        domain: 'reactor.local.example',
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    testInstanceIds.push(reactorInstance.id);
    const reactor = await createProfile({
      handle: 'local-reactor',
      instanceId: reactorInstance.id,
      kind: InstanceKind.LOCAL,
    });
    const types = ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'] as const;
    for (const [index, type] of types.entries()) {
      await createReaction(reactor.id, post.id, type, {
        createdAt: Temporal.Instant.from(`2026-08-01T00:0${index}:00Z`),
      });
    }

    const page = await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, null);
    assert.ok(page);
    assert.equal(page.items.length, types.length);
    const itemsByType = new Map<string, Like | EmojiReact>();
    for (const candidate of page.items) {
      itemsByType.set(candidate.content?.toString() ?? '', candidate);
    }
    for (const type of types) {
      const item: Like | EmojiReact | undefined = itemsByType.get(type);
      assert.ok(item);
      assert.equal(item.content?.toString(), type);
      assert.equal(item.objectId?.href, `${publicOrigin}/ap/note/${post.id}`);
      assert.equal(item.actorId?.href, `${reactorInstance.canonicalOrigin}/ap/actor/${reactor.id}`);
      assert.equal(
        item.id?.href.startsWith(`${reactorInstance.canonicalOrigin}/ap/reaction/`),
        true,
      );
      assert.equal(type === '❤️', item instanceof Like);
      assert.equal(type !== '❤️', item instanceof EmojiReact);
    }
  });

  test('uses opaque keyset cursors and a stable maximum page size', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    for (let index = 0; index < 51; index++) {
      const profile = await createProfile({
        handle: `reaction-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, post.id, '🥹', {
        createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
      });
    }

    const firstPage = await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, null);
    assert.ok(firstPage);
    assert.equal(firstPage.items.length, 50);
    assert.match(firstPage.nextCursor ?? '', /^v1:[A-Za-z0-9_-]+$/);
    const secondPage = await dispatchLocalPostEmojiReactions(
      createContext(),
      { id: post.id },
      firstPage.nextCursor ?? null,
    );
    assert.ok(secondPage);
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.nextCursor, undefined);
    assert.equal(
      new Set([...firstPage.items, ...secondPage.items].map((item) => item.id?.href)).size,
      51,
    );
    const pagedReactionIds = [...firstPage.items, ...secondPage.items].map((item) =>
      new URL(item.id!).pathname.split('/').at(-1),
    );
    assert.deepEqual(pagedReactionIds, [...pagedReactionIds].sort().reverse());

    const spreadPost = await createPost(author.id);
    for (let index = 0; index < 51; index++) {
      const profile = await createProfile({
        handle: `spread-valid-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, spreadPost.id, '🥹', {
        createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
      });
    }
    const malformedReactionIds: string[] = [];
    for (let index = 0; index < 26; index++) {
      const profile = await createProfile({
        domain: 'malformed.example',
        handle: `spread-malformed-${index}`,
      });
      await db.insert(ActivityPubActors).values({
        profileId: profile.id,
        type: ActivityPubActorType.PERSON,
        uri: `https://malformed.example/users/${index}`,
      });
      const malformedReaction = await createReaction(profile.id, spreadPost.id, '🥹', {
        activityUri: `not-a-url-${index}`,
        createdAt: Temporal.Instant.from('2026-08-02T00:00:00Z'),
      });
      malformedReactionIds.push(malformedReaction.id);
    }
    const spreadFirst = await dispatchLocalPostEmojiReactions(
      createContext(),
      { id: spreadPost.id },
      null,
    );
    assert.ok(spreadFirst);
    assert.equal(spreadFirst.items.length, 50);
    assert.ok(spreadFirst.nextCursor);
    const spreadSecond = await dispatchLocalPostEmojiReactions(
      createContext(),
      { id: spreadPost.id },
      spreadFirst.nextCursor ?? null,
    );
    assert.ok(spreadSecond);
    assert.equal(spreadSecond.items.length, 1);
    assert.equal(spreadSecond.nextCursor, undefined);
    const malformedId = malformedReactionIds[0];
    assert.ok(malformedId);
    const malformedCursor = `v1:${Buffer.from(
      JSON.stringify({
        createdAt: '2026-08-02T00:00:00Z',
        id: malformedId,
      }),
      'utf8',
    ).toString('base64url')}`;
    assert.equal(
      await dispatchLocalPostEmojiReactions(
        createContext(),
        { id: spreadPost.id },
        malformedCursor,
      ),
      null,
    );

    const exactPost = await createPost(author.id);
    for (let index = 0; index < 50; index++) {
      const profile = await createProfile({
        handle: `exact-valid-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, exactPost.id, '🥹', {
        createdAt: Temporal.Instant.from('2026-08-02T00:00:00Z'),
      });
    }
    const tailProfile = await createProfile({ domain: 'tail-malformed.example' });
    await db.insert(ActivityPubActors).values({
      profileId: tailProfile.id,
      type: ActivityPubActorType.PERSON,
      uri: 'https://tail-malformed.example/users/1',
    });
    await createReaction(tailProfile.id, exactPost.id, '🥹', {
      activityUri: 'not-a-url-tail',
      createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
    });
    const exactPage = await dispatchLocalPostEmojiReactions(
      createContext(),
      { id: exactPost.id },
      null,
    );
    assert.ok(exactPage);
    assert.equal(exactPage.items.length, 50);
    assert.equal(exactPage.nextCursor, undefined);
    assert.equal(
      await firstLocalPostEmojiReactionsCursor(createContext(), { id: post.id }),
      'v1:first',
    );
    assert.equal(
      await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, 'v1:not-a-cursor'),
      null,
    );
  });

  test('serves empty, one-item, and exactly-full collections', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    for (const size of [0, 1, 50]) {
      const post = await createPost(author.id);
      for (let index = 0; index < size; index++) {
        const profile = await createProfile({
          handle: `boundary-${size}-${index}`,
          kind: InstanceKind.LOCAL,
        });
        await createReaction(profile.id, post.id, '🥹');
      }
      const page = await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, null);
      assert.ok(page);
      assert.equal(page.items.length, size);
      assert.equal(page.nextCursor, undefined);
      assert.equal(await countLocalPostEmojiReactions(createContext(), { id: post.id }), size);
    }
  });

  test('serves Public and Unlisted collections to anonymous requests', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const federation = createUnsignedCollectionFederation();
    const fetchCollection = async (postId: string) =>
      federation.fetch(
        new Request(`${publicOrigin}/ap/note/${postId}/emoji-reactions`, {
          headers: { accept: 'application/activity+json' },
        }),
        {
          contextData: undefined,
          onNotFound: () => new Response('Not found', { status: 404 }),
          onUnauthorized: () => new Response('Not found', { status: 404 }),
        },
      );
    for (const visibility of [PostVisibility.PUBLIC, PostVisibility.UNLISTED]) {
      const post = await createPost(author.id, { visibility });
      const response = await fetchCollection(post.id);
      assert.equal(response.status, 200);
      const document = (await response.json()) as { totalItems?: number; type?: string };
      assert.equal(document.type, 'Collection');
      assert.equal(document.totalItems, 0);
    }
    assert.equal(
      (
        await fetchCollection(
          (await createPost(author.id, { visibility: PostVisibility.DIRECT })).id,
        )
      ).status,
      404,
    );
    const contentless = await db
      .insert(Posts)
      .values({ profileId: author.id, state: PostState.ACTIVE, visibility: PostVisibility.PUBLIC })
      .returning()
      .then(firstOrThrow);
    assert.equal((await fetchCollection(contentless.id)).status, 404);
  });

  test('hides the collection with the same signed Followers Only boundary as its Note', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const followersPost = await createPost(author.id, { visibility: PostVisibility.FOLLOWERS });
    const remoteFollower = await createProfile({ domain: 'remote.example' });
    const signedFixture = await createSignedFederation();
    const fetchCollection = () => signedFixture.fetchCollection(followersPost.id);

    assert.equal((await fetchCollection()).status, 404);
    await db.insert(ActivityPubActors).values({
      profileId: remoteFollower.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: remoteFollower.id,
    });
    assert.equal((await fetchCollection()).status, 200);
    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, remoteFollower.instanceId));
    assert.equal((await fetchCollection()).status, 404);
  });
});

const createContext = (): RequestContext<void> => {
  const federation = createFederation<void>({ kv: new MemoryKvStore(), origin: publicOrigin });
  federation.setActorDispatcher(
    '/ap/actor/{identifier}',
    (context, identifier) => new Person({ id: context.getActorUri(identifier) }),
  );
  return federation.createContext(
    new Request(`${publicOrigin}/ap/note/00000000-0000-8000-8000-000000000001`),
    undefined,
  );
};

const createUnsignedCollectionFederation = () => {
  const federation = createFederation<void>({ kv: new MemoryKvStore(), origin: publicOrigin });
  federation.setActorDispatcher(
    '/ap/actor/{identifier}',
    (context, identifier) => new Person({ id: context.getActorUri(identifier) }),
  );
  federation
    .setCollectionDispatcher(
      'activitypub-note-emoji-reactions',
      ActivityObject,
      '/ap/note/{id}/emoji-reactions',
      dispatchLocalPostEmojiReactions,
    )
    .setCounter(countLocalPostEmojiReactions)
    .setFirstCursor(firstLocalPostEmojiReactionsCursor)
    .authorize((context, values) => authorizeLocalPostNote(context, { id: values.id ?? '' }));
  return federation;
};

const createSignedFederation = async () => {
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKey = new CryptographicKey({
    id: remoteKeyUri,
    owner: remoteActorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({ id: remoteActorUri, publicKey: remoteKey });
  const documents = new Map<string, unknown>([
    [remoteActorUri.href, await remoteActor.toJsonLd({ format: 'expand' })],
    [remoteKeyUri.href, await remoteKey.toJsonLd({ format: 'expand' })],
  ]);
  const documentLoader = async (url: string) => ({
    contextUrl: null,
    document: documents.get(url),
    documentUrl: url,
  });
  const federation = createFederation<void>({
    authenticatedDocumentLoaderFactory: () => documentLoader,
    contextLoaderFactory: getDocumentLoader,
    documentLoaderFactory: () => documentLoader,
    kv: new MemoryKvStore(),
    origin: publicOrigin,
  });
  federation.setActorDispatcher(
    '/ap/actor/{identifier}',
    (context, identifier) => new Person({ id: context.getActorUri(identifier) }),
  );
  federation
    .setObjectDispatcher(Note, '/ap/note/{id}', dispatchLocalPostNote)
    .authorize(authorizeLocalPostNote);
  federation
    .setCollectionDispatcher(
      'activitypub-note-emoji-reactions',
      ActivityObject,
      '/ap/note/{id}/emoji-reactions',
      dispatchLocalPostEmojiReactions,
    )
    .setCounter(countLocalPostEmojiReactions)
    .setFirstCursor(firstLocalPostEmojiReactionsCursor)
    .authorize((context, values) => authorizeLocalPostNote(context, { id: values.id ?? '' }));

  const createRequest = (postId: string) =>
    signRequest(
      new Request(`${publicOrigin}/ap/note/${postId}`, {
        headers: { accept: 'application/activity+json' },
      }),
      remoteKeyPair.privateKey,
      remoteKeyUri,
    );
  const fetch = async (postId: string) => {
    const request = await createRequest(postId);
    return federation.fetch(request, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
    });
  };
  const fetchCollection = async (postId: string) => {
    const request = await signRequest(
      new Request(`${publicOrigin}/ap/note/${postId}/emoji-reactions`, {
        headers: { accept: 'application/activity+json' },
      }),
      remoteKeyPair.privateKey,
      remoteKeyUri,
    );
    return federation.fetch(request, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
      onNotFound: () => new Response('Not found', { status: 404 }),
    });
  };
  return { createRequest, federation, fetch, fetchCollection };
};

const createProfile = async ({
  domain,
  handle = 'profile',
  instanceId: requestedInstanceId,
  kind = InstanceKind.ACTIVITYPUB,
  state = ProfileState.ACTIVE,
}: {
  domain?: string;
  handle?: string;
  instanceId?: string;
  kind?: (typeof InstanceKind)[keyof typeof InstanceKind];
  state?: (typeof ProfileState)[keyof typeof ProfileState];
}) => {
  const instanceId = requestedInstanceId
    ? requestedInstanceId
    : kind === InstanceKind.LOCAL
      ? localInstanceId
      : await db
          .insert(Instances)
          .values({
            domain: domain ? `${crypto.randomUUID()}.${domain}` : `${crypto.randomUUID()}.example`,
            kind,
            state: InstanceState.ACTIVE,
          })
          .returning({ id: Instances.id })
          .then(firstOrThrow)
          .then(({ id }) => {
            testInstanceIds.push(id);
            return id;
          });

  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle,
      state,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.push(profile.id);
  return profile;
};

const createPost = async (
  profileId: string,
  {
    replyParentId = null,
    media = [],
    sensitiveMedia = false,
    state = PostState.ACTIVE,
    summary = null,
    visibility = PostVisibility.PUBLIC,
  }: {
    replyParentId?: string | null;
    media?: readonly { readonly altText: string | null; readonly mediaId: string }[];
    sensitiveMedia?: boolean;
    state?: (typeof PostState)[keyof typeof PostState];
    summary?: string | null;
    visibility?: (typeof PostVisibility)[keyof typeof PostVisibility];
  } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, replyParentId, state, visibility })
    .returning()
    .then(firstOrThrow);
  for (const { altText, mediaId } of media) {
    await db.update(Media).set({ altText }).where(eq(Media.id, mediaId));
  }
  const content = await db
    .insert(PostContents)
    .values({
      document: {
        body: {
          ...(sensitiveMedia ? { attrs: { sensitiveMedia: true } } : {}),
          content: [
            { content: [{ text: 'body', type: 'text' }], type: 'paragraph' },
            ...media.map(({ mediaId }) => ({
              attrs: { mediaId },
              type: 'media' as const,
            })),
          ],
          type: 'doc',
        },
        summary,
        version: 1,
      },
      postId: post.id,
    })
    .returning()
    .then(firstOrThrow);
  return db
    .update(Posts)
    .set({ currentContentId: content.id })
    .where(eq(Posts.id, post.id))
    .returning()
    .then(firstOrThrow);
};

const createReaction = async (
  profileId: string,
  postId: string,
  type: string,
  { activityUri, createdAt }: { activityUri?: string; createdAt?: Temporal.Instant } = {},
) => {
  const reaction = await db
    .insert(Reactions)
    .values({ profileId, postId, type, ...(createdAt ? { createdAt } : {}) })
    .returning()
    .then(firstOrThrow);
  if (activityUri) {
    await db.insert(ActivityPubReactions).values({ reactionId: reaction.id, uri: activityUri });
  }
  return reaction;
};

const createMedia = async (
  profileId: string,
  {
    source = MediaSource.LOCAL,
    state = MediaState.READY,
    storageReference = `u_${crypto.randomUUID()}`,
    mediaType = source === MediaSource.LOCAL && state === MediaState.READY ? 'image/webp' : null,
    url = state === MediaState.READY
      ? source === MediaSource.LOCAL
        ? `https://cdn.example/media/${encodeURIComponent(storageReference)}`
        : `https://remote.example/media/${crypto.randomUUID()}`
      : null,
  }: {
    mediaType?: string | null;
    url?: string | null;
    source?: (typeof MediaSource)[keyof typeof MediaSource];
    state?: (typeof MediaState)[keyof typeof MediaState];
    storageReference?: string;
  } = {},
) => {
  const account = await db
    .insert(Accounts)
    .values({
      displayName: `media-${crypto.randomUUID()}`,
      oidcSubject: `media-${crypto.randomUUID()}`,
      state: AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testAccountIds.push(account.id);
  return db
    .insert(Media)
    .values({
      accountId: source === MediaSource.LOCAL ? account.id : null,
      mediaType,
      url,
      profileId,
      readyAt:
        source === MediaSource.LOCAL && state === MediaState.READY ? Temporal.Now.instant() : null,
      source,
      state,
      storageReference: source === MediaSource.LOCAL ? storageReference : null,
      uploadExpiresAt:
        source === MediaSource.LOCAL ? Temporal.Now.instant().add({ minutes: 5 }) : null,
    })
    .returning()
    .then(firstOrThrow);
};

const cleanTestRows = async () => {
  if (testProfileIds.length === 0) {
    return;
  }

  const postIds = await db
    .select({ id: Posts.id })
    .from(Posts)
    .where(inArray(Posts.profileId, testProfileIds))
    .then((rows) => rows.map(({ id }) => id));
  if (postIds.length > 0) {
    await db.update(Posts).set({ currentContentId: null }).where(inArray(Posts.id, postIds));
    await db.delete(PostContents).where(inArray(PostContents.postId, postIds));
    await db.delete(Posts).where(inArray(Posts.id, postIds));
  }
  await db.delete(Media).where(inArray(Media.profileId, testProfileIds));
  await db.delete(Profiles).where(inArray(Profiles.id, testProfileIds));
  if (testAccountIds.length > 0) {
    await db.delete(Accounts).where(inArray(Accounts.id, testAccountIds));
  }
  if (testInstanceIds.length > 0) {
    await db.delete(Instances).where(inArray(Instances.id, testInstanceIds));
  }
  testInstanceIds = [];
  testAccountIds = [];
  testProfileIds = [];
};
