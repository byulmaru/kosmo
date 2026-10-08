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
import type * as FederationModule from './federation';
import type * as LocalPostNoteModule from './local-post-note';
import type * as LocalPostReactionCollectionModule from './local-post-reaction-collection';
import type * as LocalProfileFeaturedModule from './local-profile-featured';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const remoteActorUri = new URL('https://prod-494.remote.example/users/follower');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubReactions: typeof CoreDb.ActivityPubReactions;
let Accounts: typeof CoreDb.Accounts;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let authorizeLocalPostNote: typeof LocalPostNoteModule.authorizeLocalPostNote;
let authorizeLocalProfileFeatured: typeof LocalProfileFeaturedModule.authorizeLocalProfileFeatured;
let db: typeof CoreDb.db;
let dispatchLocalPostNote: typeof LocalPostNoteModule.dispatchLocalPostNote;
let dispatchLocalProfileFeatured: typeof LocalProfileFeaturedModule.dispatchLocalProfileFeatured;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let isCanonicalPostId: typeof PostUriModule.isCanonicalPostId;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let PostMentions: typeof CoreDb.PostMentions;
let Posts: typeof CoreDb.Posts;
let ProfileFollowRequests: typeof CoreDb.ProfileFollowRequests;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let ProfilePinnedPosts: typeof CoreDb.ProfilePinnedPosts;
let Profiles: typeof CoreDb.Profiles;
let Reactions: typeof CoreDb.Reactions;
let resolveActivityPubPostUri: typeof PostUriModule.resolveActivityPubPostUri;
let countLocalPostEmojiReactions: typeof LocalPostReactionCollectionModule.countLocalPostEmojiReactions;
let dispatchLocalPostEmojiReactions: typeof LocalPostReactionCollectionModule.dispatchLocalPostEmojiReactions;
let firstLocalPostEmojiReactionsCursor: typeof LocalPostReactionCollectionModule.firstLocalPostEmojiReactionsCursor;
let countLocalProfileFeatured: typeof LocalProfileFeaturedModule.countLocalProfileFeatured;
let firstLocalProfileFeaturedCursor: typeof LocalProfileFeaturedModule.firstLocalProfileFeaturedCursor;
let productionFederation: typeof FederationModule.federation;
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
      PostMentions,
      Posts,
      ProfileFollowRequests,
      ProfileFollows,
      ProfilePinnedPosts,
      Profiles,
      Reactions,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ isCanonicalPostId, resolveActivityPubPostUri } = await import('./activitypub-post-uri'));
    ({ authorizeLocalPostNote, dispatchLocalPostNote } = await import('./local-post-note'));
    ({
      authorizeLocalProfileFeatured,
      countLocalProfileFeatured,
      dispatchLocalProfileFeatured,
      firstLocalProfileFeaturedCursor,
    } = await import('./local-profile-featured'));
    ({ federation: productionFederation } = await import('./federation'));
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

  test('keeps a stored Mention fallback when it has no current PostMentions relation', async () => {
    const author = await createProfile({ handle: 'mention-author', kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    assert.ok(post.currentContentId);

    await db
      .update(PostContents)
      .set({
        document: {
          body: {
            content: [
              {
                content: [
                  { text: 'Hello ', type: 'text' },
                  {
                    attrs: { profileId: author.id },
                    type: 'mention',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          summary: null,
          version: 1,
        },
      })
      .where(eq(PostContents.id, post.currentContentId));

    const note = await dispatchLocalPostNote(createContext(), { id: post.id });
    assert.ok(note);
    assert.equal(note.content?.toString(), '<p>Hello <span>@알 수 없는 사용자</span></p>');
    assert.deepEqual(note.tagIds, []);
  });

  test('projects current local and remote Mentions to escaped HTML and unique ActivityPub tags', async () => {
    const author = await createProfile({ handle: 'mention-author', kind: InstanceKind.LOCAL });
    const localTarget = await createProfile({ handle: 'local-target', kind: InstanceKind.LOCAL });
    const remoteTarget = await createProfile({ domain: 'remote.example', handle: 'remote-target' });
    const unsafeUrlTarget = await createProfile({
      domain: 'unsafe-url.example',
      handle: 'unsafe-url-target',
    });
    const malformedActorTarget = await createProfile({
      domain: 'malformed-actor.example',
      handle: 'malformed-actor-target',
    });
    const hiddenTarget = await createProfile({
      domain: 'disabled.example',
      handle: 'disabled-target',
      state: ProfileState.DISABLED,
    });
    const unsupportedLocalInstance = await db
      .insert(Instances)
      .values({
        canonicalOrigin: 'https://other-local.example',
        domain: 'other-local.example',
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);
    testInstanceIds.push(unsupportedLocalInstance.id);
    const unsupportedLocalTarget = await createProfile({
      handle: 'other-local-target',
      instanceId: unsupportedLocalInstance.id,
    });
    const oldRevisionTarget = await createProfile({
      handle: 'old-revision-target',
      kind: InstanceKind.LOCAL,
    });
    const orphanTarget = await createProfile({ handle: 'orphan-target', kind: InstanceKind.LOCAL });
    const remoteDomain = await db
      .select({ domain: Instances.domain })
      .from(Instances)
      .where(eq(Instances.id, remoteTarget.instanceId))
      .then(firstOrThrow)
      .then(({ domain }) => domain);
    const unsafeUrlDomain = await db
      .select({ domain: Instances.domain })
      .from(Instances)
      .where(eq(Instances.id, unsafeUrlTarget.instanceId))
      .then(firstOrThrow)
      .then(({ domain }) => domain);
    const remoteActorUri = new URL(`https://${remoteDomain}/users/remote-target`);
    const unsafeUrlActorUri = new URL(`https://${unsafeUrlDomain}/users/unsafe-url-target`);
    const hiddenTargetDomain = await db
      .select({ domain: Instances.domain })
      .from(Instances)
      .where(eq(Instances.id, hiddenTarget.instanceId))
      .then(firstOrThrow)
      .then(({ domain }) => domain);
    const hiddenTargetActorUri = new URL(`https://${hiddenTargetDomain}/users/disabled-target`);
    await db.insert(ActivityPubActors).values([
      {
        profileId: remoteTarget.id,
        profileUrl: 'https://profiles.example/@remote-target',
        type: ActivityPubActorType.PERSON,
        uri: remoteActorUri.href,
      },
      {
        profileId: unsafeUrlTarget.id,
        profileUrl: 'javascript:alert(1)',
        type: ActivityPubActorType.PERSON,
        uri: unsafeUrlActorUri.href,
      },
      {
        profileId: malformedActorTarget.id,
        profileUrl: null,
        type: ActivityPubActorType.PERSON,
        uri: 'not a URL',
      },
      {
        profileId: hiddenTarget.id,
        profileUrl: null,
        type: ActivityPubActorType.PERSON,
        uri: hiddenTargetActorUri.href,
      },
    ]);
    const post = await createPost(author.id);
    assert.ok(post.currentContentId);
    const mentionNode = (profileId: string) => ({
      attrs: { profileId },
      type: 'mention' as const,
    });

    await db
      .update(PostContents)
      .set({
        document: {
          body: {
            content: [{ content: [mentionNode(oldRevisionTarget.id)], type: 'paragraph' }],
            type: 'doc',
          },
          summary: null,
          version: 1,
        },
      })
      .where(eq(PostContents.id, post.currentContentId));
    await db.insert(PostMentions).values({
      postContentId: post.currentContentId,
      profileId: oldRevisionTarget.id,
    });

    const currentContent = await db
      .insert(PostContents)
      .values({
        document: {
          body: {
            content: [
              {
                content: [
                  { text: 'Hello <script>alert(1)</script> & ', type: 'text' },
                  mentionNode(localTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(localTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(remoteTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(unsafeUrlTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(malformedActorTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(orphanTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(oldRevisionTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(unsupportedLocalTarget.id),
                  { text: ' ', type: 'text' },
                  mentionNode(hiddenTarget.id),
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          summary: null,
          version: 1,
        },
        postId: post.id,
      })
      .returning()
      .then(firstOrThrow);
    await db
      .update(Posts)
      .set({ currentContentId: currentContent.id })
      .where(eq(Posts.id, post.id));
    await db.insert(PostMentions).values(
      [
        localTarget.id,
        remoteTarget.id,
        unsafeUrlTarget.id,
        malformedActorTarget.id,
        hiddenTarget.id,
        unsupportedLocalTarget.id,
      ].map((profileId) => ({
        postContentId: currentContent.id,
        profileId,
      })),
    );

    const note = await dispatchLocalPostNote(createContext(), { id: post.id });
    assert.ok(note);
    assert.equal(note.toId?.href, PUBLIC_COLLECTION.href);
    assert.equal(note.ccId?.href, `${publicOrigin}/ap/actor/${author.id}/followers`);
    const html = note.content?.toString() ?? '';
    assert.ok(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt; &amp; '));
    assert.ok(
      html.includes(
        `<span class="h-card"><a href="${publicOrigin}/@local-target" class="u-url mention">@local-target</a></span>`,
      ),
    );
    assert.equal(html.match(/@local-target<\/a>/gu)?.length, 2);
    assert.ok(
      html.includes(
        `<a href="https://profiles.example/@remote-target" class="u-url mention">@remote-target@${remoteDomain}</a>`,
      ),
    );
    assert.ok(
      html.includes(
        `<a href="${unsafeUrlActorUri.href}" class="u-url mention">@unsafe-url-target@${unsafeUrlDomain}</a>`,
      ),
    );
    assert.doesNotMatch(html, /javascript:|<script>/u);
    assert.equal(html.match(/<span>@알 수 없는 사용자<\/span>/gu)?.length, 5);

    const jsonLd = await note.toJsonLd();
    const serializedTags = (jsonLd as { readonly tag?: unknown }).tag;
    const serializedTagValues = Array.isArray(serializedTags) ? serializedTags : [serializedTags];
    assert.deepEqual(
      serializedTagValues
        .map((tag) => {
          const mentionTag = tag as {
            readonly href?: string;
            readonly name?: string;
            readonly type?: string;
          };
          return { href: mentionTag.href, name: mentionTag.name, type: mentionTag.type };
        })
        .sort((left, right) => (left.href ?? '').localeCompare(right.href ?? '')),
      [
        {
          href: `${publicOrigin}/ap/actor/${localTarget.id}`,
          name: '@local-target',
          type: 'Mention',
        },
        { href: remoteActorUri.href, name: `@remote-target@${remoteDomain}`, type: 'Mention' },
        {
          href: unsafeUrlActorUri.href,
          name: `@unsafe-url-target@${unsafeUrlDomain}`,
          type: 'Mention',
        },
      ].sort((left, right) => left.href.localeCompare(right.href)),
    );
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
    const context = Object.assign(createContext(), {
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

  test('counts and pages a newly supported Type while excluding invalid stored rows', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    for (let index = 0; index < 51; index++) {
      const profile = await createProfile({
        handle: `full-reaction-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, post.id, '🫶', {
        createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
      });
    }
    const invalidProfile = await createProfile({
      handle: 'invalid-reaction',
      kind: InstanceKind.LOCAL,
    });
    await createReaction(invalidProfile.id, post.id, 'custom', {
      createdAt: Temporal.Instant.from('2026-08-02T00:00:00Z'),
    });

    const firstPage = await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, null);
    assert.ok(firstPage);
    assert.equal(firstPage.items.length, 50);
    assert.ok(firstPage.nextCursor);
    assert.equal(await countLocalPostEmojiReactions(createContext(), { id: post.id }), 51);

    const secondPage = await dispatchLocalPostEmojiReactions(
      createContext(),
      { id: post.id },
      firstPage.nextCursor ?? null,
    );
    assert.ok(secondPage);
    assert.equal(secondPage.items.length, 1);
    assert.equal(secondPage.nextCursor, undefined);
    const items = [...firstPage.items, ...secondPage.items];
    assert.equal(items.length, 51);
    assert.equal(new Set(items.map((item) => item.id?.href)).size, 51);
    assert.deepEqual(new Set(items.map((item) => item.content?.toString())), new Set(['🫶']));
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

  test('rejects a keyset cursor after its boundary Reaction is deleted', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    for (let index = 0; index < 51; index++) {
      const profile = await createProfile({
        handle: `deleted-boundary-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, post.id, '🥹', {
        createdAt: Temporal.Instant.from('2026-08-01T00:00:00Z'),
      });
    }

    const firstPage = await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, null);
    assert.ok(firstPage);
    const cursor = firstPage.nextCursor;
    assert.ok(cursor);
    const boundaryActivityUri = firstPage.items.at(-1)?.id;
    assert.ok(boundaryActivityUri);
    const boundaryReactionId = new URL(boundaryActivityUri).pathname.split('/').at(-1);
    assert.ok(boundaryReactionId);

    await db.delete(Reactions).where(eq(Reactions.id, boundaryReactionId));

    assert.equal(
      await dispatchLocalPostEmojiReactions(createContext(), { id: post.id }, cursor),
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

  test('counts more than one page with a single aggregate reaction query', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const post = await createPost(author.id);
    for (let index = 0; index < 51; index++) {
      const profile = await createProfile({
        handle: `aggregate-count-${index}`,
        kind: InstanceKind.LOCAL,
      });
      await createReaction(profile.id, post.id, '🥹');
    }

    const select = mock.method(db, 'select');
    assert.equal(await countLocalPostEmojiReactions(createContext(), { id: post.id }), 51);
    assert.equal(select.mock.callCount(), 2);
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

  test('advertises and serves an ordered Featured collection with per-Note visibility', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const publicPost = await createPost(author.id, { visibility: PostVisibility.PUBLIC });
    const unlistedPost = await createPost(author.id, { visibility: PostVisibility.UNLISTED });
    const followersPost = await createPost(author.id, { visibility: PostVisibility.FOLLOWERS });
    const directPost = await createPost(author.id, { visibility: PostVisibility.DIRECT });
    await db.insert(ProfilePinnedPosts).values([
      { profileId: author.id, postId: publicPost.id },
      { profileId: author.id, postId: unlistedPost.id },
      { profileId: author.id, postId: followersPost.id },
      { profileId: author.id, postId: directPost.id },
    ]);

    const federation = createFeaturedFederation();
    const request = (url: string) =>
      new Request(url, { headers: { accept: 'application/activity+json' } });
    const actorUri = `${publicOrigin}/ap/actor/${author.id}`;
    const featuredUri = `${actorUri}/featured`;
    const actorResponse = await federation.fetch(request(actorUri), { contextData: undefined });
    assert.equal(actorResponse.status, 200);
    assert.equal((await actorResponse.json()).featured, featuredUri);
    const productionActorResponse = await productionFederation.fetch(request(actorUri), {
      contextData: undefined,
    });
    assert.equal(productionActorResponse.status, 200);
    assert.equal((await productionActorResponse.json()).featured, featuredUri);

    const collectionResponse = await federation.fetch(request(featuredUri), {
      contextData: undefined,
    });
    assert.equal(collectionResponse.status, 200);
    const collection = (await collectionResponse.json()) as {
      first?: string;
      totalItems?: number;
    };
    assert.equal(collection.totalItems, 2);
    assert.ok(collection.first);

    const pageResponse = await federation.fetch(request(collection.first), {
      contextData: undefined,
    });
    assert.equal(pageResponse.status, 200);
    const page = (await pageResponse.json()) as { orderedItems?: { id?: string }[] };
    assert.deepEqual(
      page.orderedItems?.map((item) => item.id),
      [publicPost.id, unlistedPost.id].map((id) => `${publicOrigin}/ap/note/${id}`),
    );

    const unsignedPrivateNote = await federation.fetch(
      request(`${publicOrigin}/ap/note/${followersPost.id}`),
      {
        contextData: undefined,
        onUnauthorized: () => new Response('Not found', { status: 404 }),
      },
    );
    assert.equal(unsignedPrivateNote.status, 404);

    const nonFollowerActorUri = new URL('https://prod-494.remote.example/users/non-follower');
    const signedNonFollower = await createSignedFederation({ actorUri: nonFollowerActorUri });
    const nonFollowerCollectionResponse = await signedNonFollower.fetchFeatured(author.id);
    assert.equal(nonFollowerCollectionResponse.status, 200);
    const nonFollowerCollection = (await nonFollowerCollectionResponse.json()) as {
      first?: string;
      totalItems?: number;
    };
    assert.equal(nonFollowerCollection.totalItems, 2);
    assert.ok(nonFollowerCollection.first);
    const nonFollowerPageResponse = await signedNonFollower.fetchFeaturedPage(
      nonFollowerCollection.first,
    );
    const nonFollowerPageJson = await nonFollowerPageResponse.text();
    assert.equal(nonFollowerPageResponse.status, 200);
    assert.equal(
      nonFollowerPageJson.includes(`${publicOrigin}/ap/note/${followersPost.id}`),
      false,
    );
    assert.equal((await signedNonFollower.fetch(followersPost.id)).status, 404);

    const remoteFollower = await createProfile({ domain: 'remote.example' });
    await db.insert(ActivityPubActors).values({
      profileId: remoteFollower.id,
      type: ActivityPubActorType.PERSON,
      uri: remoteActorUri.href,
    });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: remoteFollower.id,
    });

    const signedFixture = await createSignedFederation();
    const signedCollectionResponse = await signedFixture.fetchFeatured(author.id);
    assert.equal(signedCollectionResponse.status, 200);
    const signedCollection = (await signedCollectionResponse.json()) as {
      first?: string;
      totalItems?: number;
    };
    assert.equal(signedCollection.totalItems, 3);
    assert.ok(signedCollection.first);
    const signedPageResponse = await signedFixture.fetchFeaturedPage(signedCollection.first);
    const signedPage = (await signedPageResponse.json()) as { orderedItems?: { id?: string }[] };
    assert.deepEqual(
      signedPage.orderedItems?.map((item) => item.id),
      [publicPost.id, unlistedPost.id, followersPost.id].map(
        (id) => `${publicOrigin}/ap/note/${id}`,
      ),
    );
    assert.equal((await signedFixture.fetch(followersPost.id)).status, 200);

    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED })
      .where(eq(Instances.id, remoteFollower.instanceId));
    const suspendedCollectionResponse = await signedFixture.fetchFeatured(author.id);
    assert.equal(suspendedCollectionResponse.status, 200);
    assert.equal(
      ((await suspendedCollectionResponse.json()) as { totalItems?: number }).totalItems,
      2,
    );

    const signedAuthor = await createSignedFederation({
      actorUri: new URL(`${publicOrigin}/ap/actor/${author.id}`),
    });
    const signedAuthorCollection = await signedAuthor.fetchFeatured(author.id);
    assert.equal(signedAuthorCollection.status, 200);
    assert.equal(((await signedAuthorCollection.json()) as { totalItems?: number }).totalItems, 3);
    assert.equal((await signedAuthor.fetch(followersPost.id)).status, 200);

    const boundaryAuthor = await createProfile({
      handle: 'featured-boundary',
      kind: InstanceKind.LOCAL,
    });
    const boundaryPins: { id: string; postId: string; profileId: string }[] = [];
    for (let index = 0; index < 50; index++) {
      const post = await createPost(boundaryAuthor.id, {
        visibility: PostVisibility.FOLLOWERS,
      });
      boundaryPins.push({
        id: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
        postId: post.id,
        profileId: boundaryAuthor.id,
      });
    }
    const boundaryVisiblePost = await createPost(boundaryAuthor.id, {
      visibility: PostVisibility.PUBLIC,
    });
    boundaryPins.push({
      id: '00000000-0000-7000-8000-000000000050',
      postId: boundaryVisiblePost.id,
      profileId: boundaryAuthor.id,
    });
    await db.insert(ProfilePinnedPosts).values(boundaryPins);
    const boundaryCollectionResponse = await federation.fetch(
      request(`${publicOrigin}/ap/actor/${boundaryAuthor.id}/featured`),
      { contextData: undefined },
    );
    assert.equal(boundaryCollectionResponse.status, 200);
    const boundaryCollection = (await boundaryCollectionResponse.json()) as {
      first?: string;
      totalItems?: number;
    };
    assert.equal(boundaryCollection.totalItems, 1);
    assert.ok(boundaryCollection.first);
    const boundaryPageResponse = await federation.fetch(request(boundaryCollection.first), {
      contextData: undefined,
    });
    assert.equal(boundaryPageResponse.status, 200);
    const boundaryPage = (await boundaryPageResponse.json()) as {
      orderedItems?: { id?: string }[];
    };
    assert.deepEqual(
      boundaryPage.orderedItems?.map((item) => item.id),
      [`${publicOrigin}/ap/note/${boundaryVisiblePost.id}`],
    );
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

const createFeaturedFederation = () => {
  const federation = createFederation<void>({ kv: new MemoryKvStore(), origin: publicOrigin });
  federation.setActorDispatcher(
    '/ap/actor/{identifier}',
    (context, identifier) =>
      new Person({
        id: context.getActorUri(identifier),
        featured: context.getFeaturedUri(identifier),
      }),
  );
  federation
    .setObjectDispatcher(Note, '/ap/note/{id}', dispatchLocalPostNote)
    .authorize(authorizeLocalPostNote);
  federation
    .setFeaturedDispatcher('/ap/actor/{identifier}/featured', dispatchLocalProfileFeatured)
    .setCounter(countLocalProfileFeatured)
    .setFirstCursor(firstLocalProfileFeaturedCursor)
    .authorize(authorizeLocalProfileFeatured);
  return federation;
};

const createSignedFederation = async ({ actorUri = remoteActorUri }: { actorUri?: URL } = {}) => {
  const keyUri = new URL('#main-key', actorUri);
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKey = new CryptographicKey({
    id: keyUri,
    owner: actorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({ id: actorUri, publicKey: remoteKey });
  const documents = new Map<string, unknown>([
    [actorUri.href, await remoteActor.toJsonLd({ format: 'expand' })],
    [keyUri.href, await remoteKey.toJsonLd({ format: 'expand' })],
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
    (context, identifier) =>
      new Person({
        id: context.getActorUri(identifier),
        featured: context.getFeaturedUri(identifier),
      }),
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
  federation
    .setFeaturedDispatcher('/ap/actor/{identifier}/featured', dispatchLocalProfileFeatured)
    .setCounter(countLocalProfileFeatured)
    .setFirstCursor(firstLocalProfileFeaturedCursor)
    .authorize(authorizeLocalProfileFeatured);

  const createRequest = (postId: string) =>
    signRequest(
      new Request(`${publicOrigin}/ap/note/${postId}`, {
        headers: { accept: 'application/activity+json' },
      }),
      remoteKeyPair.privateKey,
      keyUri,
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
      keyUri,
    );
    return federation.fetch(request, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
      onNotFound: () => new Response('Not found', { status: 404 }),
    });
  };
  const fetchFeatured = async (profileId: string) => {
    const request = await signRequest(
      new Request(`${publicOrigin}/ap/actor/${profileId}/featured`, {
        headers: { accept: 'application/activity+json' },
      }),
      remoteKeyPair.privateKey,
      keyUri,
    );
    return federation.fetch(request, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
      onNotFound: () => new Response('Not found', { status: 404 }),
    });
  };
  const fetchFeaturedPage = async (url: string) => {
    const request = await signRequest(
      new Request(url, { headers: { accept: 'application/activity+json' } }),
      remoteKeyPair.privateKey,
      keyUri,
    );
    return federation.fetch(request, {
      contextData: undefined,
      onUnauthorized: () => new Response('Not found', { status: 404 }),
      onNotFound: () => new Response('Not found', { status: 404 }),
    });
  };
  return { createRequest, federation, fetch, fetchCollection, fetchFeatured, fetchFeaturedPage };
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
