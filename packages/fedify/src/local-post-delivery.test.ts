import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import {
  Accept,
  Create,
  Delete,
  Image,
  Note,
  QuoteAuthorization,
  QuoteRequest,
  Reject,
  Update,
} from '@fedify/vocab';
import {
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type { localOutboundFederation as LocalOutboundFederation } from './local-outbound-federation';
import type * as LocalPostDelivery from './local-post-delivery';
import type { projectLocalPostNote as ProjectLocalPostNote } from './local-post-note';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let Accounts: typeof CoreDb.Accounts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let localInstanceId: string;
let localOutboundFederation: typeof LocalOutboundFederation;
let Media: typeof CoreDb.Media;
let pg: typeof CoreDb.pg;
let PostQuoteConsents: typeof CoreDb.PostQuoteConsents;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let sendLocalPostCreate: typeof LocalPostDelivery.sendLocalPostCreate;
let sendLocalPostDelete: typeof LocalPostDelivery.sendLocalPostDelete;
let sendLocalPostQuoteDecision: typeof LocalPostDelivery.sendLocalPostQuoteDecision;
let sendLocalPostQuoteRevocation: typeof LocalPostDelivery.sendLocalPostQuoteRevocation;
let sendLocalPostQuoteRequest: typeof LocalPostDelivery.sendLocalPostQuoteRequest;
let projectLocalPostNote: typeof ProjectLocalPostNote;
let testAccountIds: string[] = [];
let testInstanceIds: string[] = [];
let testProfileIds: string[] = [];

describe('ActivityPub Local Post delivery', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    ({
      Accounts,
      ActivityPubActors,
      ActivityPubPosts,
      db,
      firstOrThrow,
      Instances,
      Media,
      pg,
      PostQuoteConsents,
      PostContents,
      Posts,
      ProfileFollows,
      Profiles,
    } = await import('@kosmo/core/db'));
    const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
    ({ localOutboundFederation } = await import('./local-outbound-federation'));
    ({
      sendLocalPostCreate,
      sendLocalPostDelete,
      sendLocalPostQuoteDecision,
      sendLocalPostQuoteRequest,
      sendLocalPostQuoteRevocation,
    } = await import('./local-post-delivery'));
    ({ projectLocalPostNote } = await import('./local-post-note'));
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

  test('Create(Note) retry가 중복 handoff에서도 같은 stable identity를 쓴다', async () => {
    const { canonicalOrigin: authorOrigin, id: authorInstanceId } = await createLocalInstance();
    const author = await createProfile({ instanceId: authorInstanceId });
    const parentAuthor = await createRemoteActor({ handle: 'parent', sharedInbox: true });
    const parent = await createPost(parentAuthor.profile.id);
    const parentUri = new URL('https://remote.example/notes/parent');
    await db.insert(ActivityPubPosts).values({
      postId: parent.id,
      receivedAt: Temporal.Instant.from('2026-07-28T00:00:00Z'),
      uri: parentUri.href,
    });
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const actualContext = localOutboundFederation.createContext(new URL(authorOrigin), {
      localInstanceId: authorInstanceId,
    });
    assert.equal(actualContext.canonicalOrigin, authorOrigin);
    assert.equal(actualContext.getActorUri(author.id).origin, authorOrigin);
    const keyPairs = await actualContext.getActorKeyPairs(author.id);
    assert.equal(keyPairs.length, 2);
    assert.ok(keyPairs.every((keyPair) => keyPair.keyId.origin === authorOrigin));
    const fixture = createContextFixture(authorOrigin);
    const createContext = mock.method(
      localOutboundFederation,
      'createContext',
      (origin: URL, data: { readonly localInstanceId: string }) => {
        assert.equal(origin.href, `${authorOrigin}/`);
        assert.equal(data.localInstanceId, authorInstanceId);
        return fixture.context;
      },
    );

    await sendLocalPostCreate(reply.id);
    await sendLocalPostCreate(reply.id);

    assert.equal(createContext.mock.callCount(), 2);
    assert.equal(fixture.calls.length, 2);
    for (const call of fixture.calls) {
      assert.ok(call.activity instanceof Create);
      assert.equal(call.activity.id?.href, `${authorOrigin}/ap/note/${reply.id}#create`);
      assert.equal(call.activity.actorId?.href, `${authorOrigin}/ap/actor/${author.id}`);
      const object = await call.activity.getObject();
      assert.ok(object instanceof Note);
      assert.equal(object.id?.href, `${authorOrigin}/ap/note/${reply.id}`);
      assert.equal(object.url && new URL(object.url.toString()).origin, publicOrigin);
      assert.equal(object.replyTargetId?.href, parentUri.href);
      assert.deepEqual(call.sender, { identifier: author.id });
      assert.deepEqual(call.options, { preferSharedInbox: true });
      assert.deepEqual(
        call.recipients.map((recipient) => recipient.id?.href),
        [parentAuthor.actorUri],
      );
      assert.equal(call.recipients[0]?.endpoints?.sharedInbox?.href, parentAuthor.sharedInboxUri);
    }
  });

  test('최초 Create(Note)가 조회 시점의 ordered Media 표현과 sensitive를 그대로 전달한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'media-parent' });
    const parent = await createPost(parentAuthor.profile.id);
    await db.insert(ActivityPubPosts).values({
      postId: parent.id,
      receivedAt: Temporal.Instant.from('2026-07-30T00:00:00Z'),
      uri: 'https://remote.example/notes/media-parent',
    });
    const firstMedia = await createMedia(
      author.id,
      'opaque-first',
      'https://cdn.example/first',
      'image/avif',
    );
    const secondMedia = await createMedia(
      author.id,
      'opaque/second',
      'https://cdn.example/second',
      'image/webp',
    );
    const reply = await createPost(author.id, {
      media: [
        { altText: '', mediaId: secondMedia.id },
        { altText: '대체 텍스트', mediaId: firstMedia.id },
      ],
      replyParentId: parent.id,
      sensitiveMedia: true,
    });
    const networkRead = mock.method(globalThis, 'fetch', async () => {
      throw new Error('Create delivery must use stored representation metadata');
    });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.ok(fixture.calls[0]?.activity instanceof Create);
    const object = await fixture.calls[0].activity.getObject();
    assert.ok(object instanceof Note);
    assert.equal(object.content?.toString(), '<p>body</p>');
    assert.equal(object.sensitive, true);
    const attachments: Image[] = [];
    for await (const attachment of object.getAttachments()) {
      assert.ok(attachment instanceof Image);
      attachments.push(attachment);
    }
    assert.deepEqual(
      attachments.map((attachment) => ({
        mediaType: attachment.mediaType,
        name: attachment.name?.toString(),
        url: attachment.url?.toString(),
      })),
      [
        { mediaType: 'image/webp', name: '', url: 'https://cdn.example/second' },
        { mediaType: 'image/avif', name: '대체 텍스트', url: 'https://cdn.example/first' },
      ],
    );
    const json = JSON.stringify(await object.toJsonLd());
    assert.equal(json.includes(firstMedia.id), false);
    assert.equal(json.includes(secondMedia.id), false);
    assert.equal(networkRead.mock.callCount(), 0);
  });

  test('Public/Unlisted만 Parent Author에게 보내고 Followers·Direct·일반 Post는 no-op이다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent' });
    const parent = await createPost(parentAuthor.profile.id);
    const publicReply = await createPost(author.id, { replyParentId: parent.id });
    const unlistedReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.UNLISTED,
    });
    const followersReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.FOLLOWERS,
    });
    const directReply = await createPost(author.id, {
      replyParentId: parent.id,
      visibility: PostVisibility.DIRECT,
    });
    const rootPost = await createPost(author.id);
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(publicReply.id);
    await sendLocalPostCreate(unlistedReply.id);
    await sendLocalPostCreate(followersReply.id);
    await sendLocalPostCreate(directReply.id);
    await sendLocalPostCreate(rootPost.id);

    assert.equal(fixture.calls.length, 2);
    assert.ok(
      fixture.calls.every((call) => call.recipients[0]?.id?.href === parentAuthor.actorUri),
    );
  });

  test('Root Post followers와 direct Parent target을 함께 확장하고 actor 기준으로 중복 제거한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActor({ handle: 'follower', sharedInbox: true });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const rootPost = await createPost(author.id);
    const remoteParent = await createPost(follower.profile.id);
    const reply = await createPost(author.id, { replyParentId: remoteParent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(rootPost.id);
    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(
      fixture.calls.map((call) => call.recipients.map((recipient) => recipient.id?.href)),
      [[follower.actorUri], [follower.actorUri]],
    );
  });

  test('Local Parent Reply는 Parent direct target 없이 Author followers에게만 전달한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActor({ handle: 'follower' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const parent = await createPost(parentAuthor.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [follower.actorUri],
    );
  });

  test('Parent endpoint는 HTTP(S)만 허용하고 invalid shared inbox는 personal inbox로 fallback한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const parentAuthor = await createRemoteActor({ handle: 'parent', sharedInbox: true });
    await db
      .update(ActivityPubActors)
      .set({ sharedInboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    const parent = await createPost(parentAuthor.profile.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(reply.id);

    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0]?.recipients[0]?.inboxId?.href, `${parentAuthor.actorUri}/inbox`);
    assert.equal(fixture.calls[0]?.recipients[0]?.endpoints, null);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalPostCreate(reply.id);
    assert.equal(fixture.calls.length, 1);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: `${parentAuthor.actorUri}/inbox`, uri: 'ftp://remote.example/actor' })
      .where(eq(ActivityPubActors.profileId, parentAuthor.profile.id));
    await sendLocalPostCreate(reply.id);
    assert.equal(fixture.calls.length, 1);
  });

  test('UNRESPONSIVE와 SUSPENDED Parent는 모두 제외한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const unresponsive = await createRemoteActor({
      handle: 'unresponsive-parent',
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const suspended = await createRemoteActor({
      handle: 'suspended-parent',
      instanceState: InstanceState.SUSPENDED,
    });
    const unresponsiveReply = await createPost(author.id, {
      replyParentId: (await createPost(unresponsive.profile.id)).id,
    });
    const suspendedReply = await createPost(author.id, {
      replyParentId: (await createPost(suspended.profile.id)).id,
    });
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(unresponsiveReply.id);
    await sendLocalPostCreate(suspendedReply.id);

    assert.equal(fixture.calls.length, 0);
  });

  test('followers expansion은 Active remote actor만 유지한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const active = await createRemoteActor({ handle: 'active-follower' });
    const unresponsive = await createRemoteActor({
      handle: 'unresponsive-follower',
      instanceState: InstanceState.UNRESPONSIVE,
    });
    const suspended = await createRemoteActor({
      handle: 'suspended-follower',
      instanceState: InstanceState.SUSPENDED,
    });
    const disabled = await createRemoteActor({ handle: 'disabled-follower' });
    const invalidInbox = await createRemoteActor({ handle: 'invalid-inbox-follower' });
    const localFollower = await createProfile({ kind: InstanceKind.LOCAL });
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, disabled.profile.id));
    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'ftp://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, invalidInbox.profile.id));
    await db.insert(ProfileFollows).values(
      [
        active.profile.id,
        unresponsive.profile.id,
        suspended.profile.id,
        disabled.profile.id,
        invalidInbox.profile.id,
        localFollower.id,
      ].map((followerProfileId) => ({
        followeeProfileId: author.id,
        followerProfileId,
      })),
    );
    const rootPost = await createPost(author.id);
    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostCreate(rootPost.id);

    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [active.actorUri],
    );
  });

  test('Content 없는 Repost와 Direct Post는 Local Note lifecycle에서 제외한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const source = await createPost(author.id);
    const repost = await db
      .insert(Posts)
      .values({
        profileId: author.id,
        repostSourceId: source.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.UNLISTED,
      })
      .returning()
      .then(firstOrThrow);
    const directPost = await createPost(author.id, { visibility: PostVisibility.DIRECT });
    const createContext = mock.method(localOutboundFederation, 'createContext');

    await sendLocalPostCreate(repost.id);
    await sendLocalPostCreate(directPost.id);
    await db
      .update(Posts)
      .set({ deletedAt: Temporal.Instant.from('2026-07-28T02:00:00Z'), state: PostState.DELETED })
      .where(inArray(Posts.id, [repost.id, directPost.id]));
    await sendLocalPostDelete(repost.id);
    await sendLocalPostDelete(directPost.id);

    assert.equal(createContext.mock.callCount(), 0);
  });

  test('pending QuoteRequest는 일반 Note와 분리된 Source 관계 instrument를 보낸다', async () => {
    const quoteAuthor = await createProfile({ kind: InstanceKind.LOCAL });
    const sourceAuthor = await createRemoteActor({ handle: 'quote-request-source' });
    const source = await createPost(sourceAuthor.profile.id);
    const sourceUri = `https://remote.example/notes/${source.id}`;
    await db.insert(ActivityPubPosts).values({
      postId: source.id,
      receivedAt: Temporal.Instant.from('2026-08-02T00:00:00Z'),
      uri: sourceUri,
    });
    const quote = await createPost(quoteAuthor.id, { repostSourceId: source.id });
    const quoteUri = `${publicOrigin}/ap/note/${quote.id}`;
    const requestUri = `${publicOrigin}/ap/quote-request/${quote.id}`;
    const consent = await db
      .insert(PostQuoteConsents)
      .values({
        quoteAuthorActorUri: `${publicOrigin}/ap/actor/${quoteAuthor.id}`,
        quoteAuthorProfileId: quoteAuthor.id,
        quotePostId: quote.id,
        quoteUri,
        requestUri,
        sourceAuthorActorUri: sourceAuthor.actorUri,
        sourcePostId: source.id,
        sourceUri,
        status: PostQuoteConsentStatus.PENDING,
      })
      .returning()
      .then(firstOrThrow);

    const fixture = createContextFixture();
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    const regularNote = await projectLocalPostNote(fixture.context, quote.id);
    assert.ok(regularNote);
    assert.equal(regularNote.object.quoteId, null);

    await db
      .update(ActivityPubActors)
      .set({ inboxUri: null })
      .where(eq(ActivityPubActors.profileId, sourceAuthor.profile.id));
    await assert.rejects(
      sendLocalPostQuoteRequest({
        consentId: consent.id,
        postId: quote.id,
        revision: consent.revision,
      }),
      /delivery identity is incomplete/,
    );
    assert.equal(fixture.calls.length, 0);
    await db
      .update(ActivityPubActors)
      .set({ inboxUri: 'https://remote.example/inbox' })
      .where(eq(ActivityPubActors.profileId, sourceAuthor.profile.id));

    await sendLocalPostQuoteRequest({
      consentId: consent.id,
      postId: quote.id,
      revision: consent.revision,
    });

    assert.equal(fixture.calls.length, 1);
    const activity = fixture.calls[0]?.activity;
    assert.ok(activity instanceof QuoteRequest);
    assert.equal(activity.id?.href, requestUri);
    assert.equal(activity.objectId?.href, sourceUri);
    const instrument = await activity.getInstrument();
    assert.ok(instrument instanceof Note);
    assert.equal(instrument.id?.href, quoteUri);
    assert.equal(instrument.quoteId?.href, sourceUri);
    assert.equal(instrument.quoteUrl?.href, sourceUri);
    assert.equal(instrument.quoteAuthorizationId, null);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [sourceAuthor.actorUri],
    );
  });

  test('Source Author의 승인·거절 응답은 동일 QuoteRequest 결속과 URI-only 승인을 사용한다', async () => {
    const { canonicalOrigin: sourceOrigin, id: sourceInstanceId } = await createLocalInstance();
    const sourceAuthor = await createProfile({
      instanceId: sourceInstanceId,
      kind: InstanceKind.LOCAL,
    });
    const remoteQuoteAuthor = await createRemoteActor({ handle: 'quote-decision-author' });
    const source = await createPost(sourceAuthor.id);
    const sourceUri = sourceOrigin + '/ap/note/' + source.id;
    const quoteUri = 'https://quote-decision.example/notes/quote';
    const requestUri = 'https://quote-decision.example/quote-requests/quote';
    const approvalUri = sourceOrigin + '/ap/quote-authorization/quote';
    const consent = await db
      .insert(PostQuoteConsents)
      .values({
        approvalUri,
        quoteAuthorActorUri: remoteQuoteAuthor.actorUri,
        quoteAuthorProfileId: remoteQuoteAuthor.profile.id,
        quotePostId: null,
        quoteUri,
        requestUri,
        sourceAuthorActorUri: sourceOrigin + '/ap/actor/' + sourceAuthor.id,
        sourcePostId: source.id,
        sourceUri,
        status: PostQuoteConsentStatus.APPROVED,
      })
      .returning()
      .then(firstOrThrow);
    const fixture = createContextFixture(sourceOrigin);
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    await sendLocalPostQuoteDecision({
      consentId: consent.id,
      revision: consent.revision,
      sourcePostId: source.id,
    });

    assert.equal(fixture.calls.length, 1);
    const acceptance = fixture.calls[0]?.activity;
    assert.ok(acceptance instanceof Accept);
    assert.equal(acceptance.actorId?.href, sourceOrigin + '/ap/actor/' + sourceAuthor.id);
    assert.equal(acceptance.objectId?.href, requestUri);
    const authorization = await acceptance.getResult();
    assert.ok(authorization instanceof QuoteAuthorization);
    assert.equal(authorization.id?.href, approvalUri);
    assert.equal(authorization.interactingObjectId?.href, quoteUri);
    assert.equal(authorization.interactionTargetId?.href, sourceUri);
    assert.deepEqual(
      fixture.calls[0]?.recipients.map((recipient) => recipient.id?.href),
      [remoteQuoteAuthor.actorUri],
    );

    const rejectedSource = await createPost(sourceAuthor.id);
    const rejectedRemoteQuoteAuthor = await createRemoteActor({ handle: 'quote-reject-author' });
    const rejectedConsent = await db
      .insert(PostQuoteConsents)
      .values({
        quoteAuthorActorUri: rejectedRemoteQuoteAuthor.actorUri,
        quoteAuthorProfileId: rejectedRemoteQuoteAuthor.profile.id,
        quotePostId: null,
        quoteUri: 'https://quote-decision.example/notes/rejected',
        requestUri: 'https://quote-decision.example/quote-requests/rejected',
        sourceAuthorActorUri: sourceOrigin + '/ap/actor/' + sourceAuthor.id,
        sourcePostId: rejectedSource.id,
        sourceUri: sourceOrigin + '/ap/note/' + rejectedSource.id,
        status: PostQuoteConsentStatus.REJECTED,
      })
      .returning()
      .then(firstOrThrow);

    await sendLocalPostQuoteDecision({
      consentId: rejectedConsent.id,
      revision: rejectedConsent.revision,
      sourcePostId: rejectedSource.id,
    });
    assert.equal(fixture.calls.length, 2);
    assert.ok(fixture.calls[1]?.activity instanceof Reject);
  });

  for (const inactiveQuoteAuthor of ['profile', 'instance'] as const) {
    test(`Source 삭제 철회는 비활성 ${inactiveQuoteAuthor}의 Local Quote에도 Source 없는 Update를 보낸다`, async () => {
      const { canonicalOrigin: sourceOrigin, id: sourceInstanceId } = await createLocalInstance();
      const sourceAuthor = await createProfile({
        instanceId: sourceInstanceId,
        kind: InstanceKind.LOCAL,
      });
      const remoteQuoteAuthor = await createRemoteActor({ handle: 'revocation-author' });
      const source = await createPost(sourceAuthor.id);
      const sourceUri = sourceOrigin + '/ap/note/' + source.id;
      await db
        .update(Posts)
        .set({
          deletedAt: Temporal.Instant.from('2026-09-17T01:00:00Z'),
          state: PostState.DELETED,
        })
        .where(eq(Posts.id, source.id));
      const remoteConsent = await db
        .insert(PostQuoteConsents)
        .values({
          approvalUri: sourceOrigin + '/ap/quote-authorization/remote-quote',
          quoteAuthorActorUri: remoteQuoteAuthor.actorUri,
          quoteAuthorProfileId: remoteQuoteAuthor.profile.id,
          quotePostId: null,
          quoteUri: 'https://revocation.example/notes/remote-quote',
          requestUri: 'https://revocation.example/quote-requests/remote-quote',
          sourceAuthorActorUri: sourceOrigin + '/ap/actor/' + sourceAuthor.id,
          sourcePostId: source.id,
          sourceUri,
          status: PostQuoteConsentStatus.REVOKED,
        })
        .returning()
        .then(firstOrThrow);
      const { canonicalOrigin: quoteOrigin, id: quoteInstanceId } = await createLocalInstance();
      const localQuoteAuthor = await createProfile({
        instanceId: quoteInstanceId,
        kind: InstanceKind.LOCAL,
      });
      const localQuoteFollower = await createRemoteActor({ handle: 'local-quote-follower' });
      await db.insert(ProfileFollows).values({
        followeeProfileId: localQuoteAuthor.id,
        followerProfileId: localQuoteFollower.profile.id,
      });
      const localQuote = await createPost(localQuoteAuthor.id, { repostSourceId: source.id });
      const localConsent = await db
        .insert(PostQuoteConsents)
        .values({
          approvalUri: sourceOrigin + '/ap/quote-authorization/local-quote',
          quoteAuthorActorUri: quoteOrigin + '/ap/actor/' + localQuoteAuthor.id,
          quoteAuthorProfileId: localQuoteAuthor.id,
          quotePostId: localQuote.id,
          quoteUri: quoteOrigin + '/ap/note/' + localQuote.id,
          requestUri: quoteOrigin + '/ap/quote-request/' + localQuote.id,
          sourceAuthorActorUri: sourceOrigin + '/ap/actor/' + sourceAuthor.id,
          sourcePostId: source.id,
          sourceUri,
          status: PostQuoteConsentStatus.REVOKED,
        })
        .returning()
        .then(firstOrThrow);
      const fixture = createContextFixture(quoteOrigin);
      mock.method(localOutboundFederation, 'createContext', () => fixture.context);
      await db
        .update(Profiles)
        .set({ state: ProfileState.DISABLED })
        .where(inArray(Profiles.id, [sourceAuthor.id, remoteQuoteAuthor.profile.id]));
      await db
        .update(Instances)
        .set({ state: InstanceState.SUSPENDED })
        .where(inArray(Instances.id, [sourceInstanceId, remoteQuoteAuthor.profile.instanceId]));
      if (inactiveQuoteAuthor === 'profile') {
        await db
          .update(Profiles)
          .set({ state: ProfileState.DISABLED })
          .where(eq(Profiles.id, localQuoteAuthor.id));
      } else {
        await db
          .update(Instances)
          .set({ state: InstanceState.SUSPENDED })
          .where(eq(Instances.id, quoteInstanceId));
      }
      assert.equal(await projectLocalPostNote(fixture.context, localQuote.id), null);

      await sendLocalPostQuoteRevocation({
        consentId: remoteConsent.id,
        revision: remoteConsent.revision,
        sourcePostId: source.id,
      });
      assert.equal(fixture.calls.length, 1);
      const deletion = fixture.calls[0]?.activity;
      assert.ok(deletion instanceof Delete);
      assert.equal(deletion.objectId?.href, sourceOrigin + '/ap/quote-authorization/remote-quote');
      assert.equal(deletion.targetId?.href, sourceUri);

      await sendLocalPostQuoteRevocation({
        consentId: localConsent.id,
        revision: localConsent.revision,
        sourcePostId: source.id,
      });
      assert.equal(fixture.calls.length, 2);
      assert.ok(fixture.calls[1]?.activity instanceof Update);
      const updatedNote = await (fixture.calls[1]?.activity as Update).getObject();
      assert.ok(updatedNote instanceof Note);
      assert.equal(updatedNote.quoteId, null);
      assert.equal(updatedNote.quoteUrl, null);
      assert.equal(updatedNote.quoteAuthorizationId, null);
      assert.equal(updatedNote.content, '<p>body</p>');
      assert.deepEqual(
        fixture.calls[1]?.recipients.map((recipient) => recipient.id?.href),
        [localQuoteFollower.actorUri],
      );
    });
  }

  test('Create Activity 실행 전에 삭제된 Post는 Create를 보내지 않는다', async () => {
    const { canonicalOrigin: authorOrigin, id: authorInstanceId } = await createLocalInstance();
    const author = await createProfile({ instanceId: authorInstanceId });
    const parentAuthor = await createRemoteActor({ handle: 'parent' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: parentAuthor.profile.id,
    });
    const parent = await createPost(parentAuthor.profile.id);
    const reply = await createPost(author.id, { replyParentId: parent.id });
    const deletedAt = Temporal.Instant.from('2026-07-28T01:00:00Z');
    await db
      .update(Posts)
      .set({ deletedAt, state: PostState.DELETED })
      .where(eq(Posts.id, reply.id));
    const actualContext = localOutboundFederation.createContext(new URL(authorOrigin), {
      localInstanceId: authorInstanceId,
    });
    assert.equal(actualContext.canonicalOrigin, authorOrigin);
    assert.equal(actualContext.getActorUri(author.id).origin, authorOrigin);
    const fixture = createContextFixture(authorOrigin);
    const createContext = mock.method(
      localOutboundFederation,
      'createContext',
      (origin: URL, data: { readonly localInstanceId: string }) => {
        assert.equal(origin.href, `${authorOrigin}/`);
        assert.equal(data.localInstanceId, authorInstanceId);
        return fixture.context;
      },
    );

    await sendLocalPostCreate(reply.id);
    assert.equal(createContext.mock.callCount(), 0);

    await sendLocalPostDelete(reply.id);

    assert.equal(createContext.mock.callCount(), 1);
    assert.equal(fixture.calls.length, 1);
    const call = fixture.calls[0];
    assert.ok(call?.activity instanceof Delete);
    assert.equal(call.activity.id?.href, `${authorOrigin}/ap/note/${reply.id}#delete`);
    assert.equal(call.activity.objectId?.href, `${authorOrigin}/ap/note/${reply.id}`);
    assert.equal(call.activity.published?.toString(), deletedAt.toString());
    assert.deepEqual(call.options, { preferSharedInbox: true });
    assert.deepEqual(
      call.recipients.map((recipient) => recipient.id?.href),
      [parentAuthor.actorUri],
    );
  });

  test('disabled Profile의 Content Tombstone도 보존된 actor key로 Delete를 handoff한다', async () => {
    const { canonicalOrigin: authorOrigin, id: authorInstanceId } = await createLocalInstance();
    const author = await createProfile({ instanceId: authorInstanceId });
    const follower = await createRemoteActor({ handle: 'disabled-author-follower' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const post = await createPost(author.id);
    const actualContext = localOutboundFederation.createContext(new URL(authorOrigin), {
      localInstanceId: authorInstanceId,
    });
    assert.equal((await actualContext.getActorKeyPairs(author.id)).length, 2);

    const deletedAt = Temporal.Instant.from('2026-07-28T02:30:00Z');
    await db
      .update(Posts)
      .set({ deletedAt, state: PostState.DELETED })
      .where(eq(Posts.id, post.id));
    await db
      .update(Profiles)
      .set({ state: ProfileState.DISABLED })
      .where(eq(Profiles.id, author.id));
    assert.equal((await actualContext.getActorKeyPairs(author.id)).length, 2);

    const fixture = createContextFixture(authorOrigin);
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);
    await sendLocalPostDelete(post.id);

    assert.equal(fixture.calls.length, 1);
    const activity = fixture.calls[0]?.activity;
    assert.ok(activity instanceof Delete);
    assert.equal(activity.id?.href, `${authorOrigin}/ap/note/${post.id}#delete`);
    assert.equal(activity.published?.toString(), deletedAt.toString());
  });

  test('Create queue handoff 중 Delete는 row lock이나 보정 handoff 없이 commit한다', async () => {
    const author = await createProfile({ kind: InstanceKind.LOCAL });
    const follower = await createRemoteActor({ handle: 'concurrent-delete-follower' });
    await db.insert(ProfileFollows).values({
      followeeProfileId: author.id,
      followerProfileId: follower.profile.id,
    });
    const post = await createPost(author.id);
    const handoffStarted = Promise.withResolvers<void>();
    const releaseHandoff = Promise.withResolvers<void>();
    const fixture = createContextFixture(publicOrigin, async (callIndex) => {
      if (callIndex === 1) {
        handoffStarted.resolve();
        await releaseHandoff.promise;
      }
    });
    mock.method(localOutboundFederation, 'createContext', () => fixture.context);

    const createHandoff = sendLocalPostCreate(post.id);
    await handoffStarted.promise;

    const deletedAt = Temporal.Instant.from('2026-07-28T03:00:00Z');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        db.update(Posts).set({ deletedAt, state: PostState.DELETED }).where(eq(Posts.id, post.id)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Delete waited for Create queue handoff')),
            500,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      releaseHandoff.resolve();
    }
    await createHandoff;
    await sendLocalPostDelete(post.id);

    assert.deepEqual(
      fixture.calls.map((call) => call.activity.constructor),
      [Create, Delete],
    );
  });
});

interface SendActivityCall {
  readonly activity: Activity;
  readonly options: { readonly preferSharedInbox: boolean };
  readonly recipients: Recipient[];
  readonly sender: { readonly identifier: string };
}

const createContextFixture = (
  canonicalOrigin = publicOrigin,
  beforeSend?: (callIndex: number) => Promise<void>,
) => {
  const calls: SendActivityCall[] = [];
  const context = {
    canonicalOrigin,
    getActorUri: (identifier: string) => new URL(`/ap/actor/${identifier}`, canonicalOrigin),
    sendActivity: async (
      sender: { identifier: string },
      recipients: Recipient | Recipient[],
      activity: Activity,
      options: { preferSharedInbox: boolean },
    ) => {
      calls.push({
        activity,
        options,
        recipients: Array.isArray(recipients) ? recipients : [recipients],
        sender,
      });
      await beforeSend?.(calls.length);
    },
  } as Context<void>;
  return { calls, context };
};

const createLocalInstance = async () => {
  const domain = `${crypto.randomUUID()}.local.example`;
  const canonicalOrigin = `https://${domain}`;
  const instance = await db
    .insert(Instances)
    .values({ canonicalOrigin, domain, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.push(instance.id);
  return { canonicalOrigin, id: instance.id };
};

const createProfile = async ({
  handle = `profile-${crypto.randomUUID()}`,
  instanceId,
  kind = InstanceKind.ACTIVITYPUB,
}: {
  handle?: string;
  instanceId?: string;
  kind?: InstanceKind;
}) => {
  const resolvedInstanceId =
    instanceId ??
    (kind === InstanceKind.LOCAL
      ? localInstanceId
      : await db
          .insert(Instances)
          .values({
            domain: `${crypto.randomUUID()}.example`,
            kind,
            state: InstanceState.ACTIVE,
          })
          .returning({ id: Instances.id })
          .then(firstOrThrow)
          .then(({ id }) => {
            testInstanceIds.push(id);
            return id;
          }));
  assert.ok(resolvedInstanceId);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: resolvedInstanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  testProfileIds.push(profile.id);
  return profile;
};

const createRemoteActor = async ({
  handle,
  instanceState = InstanceState.ACTIVE,
  sharedInbox = false,
}: {
  handle: string;
  instanceState?: InstanceState;
  sharedInbox?: boolean;
}) => {
  const instance = await db
    .insert(Instances)
    .values({
      domain: `${crypto.randomUUID()}.remote.example`,
      kind: InstanceKind.ACTIVITYPUB,
      state: instanceState,
    })
    .returning()
    .then(firstOrThrow);
  testInstanceIds.push(instance.id);
  const profile = await createProfile({ handle, instanceId: instance.id });
  const actorUri = `https://${instance.domain}/users/${handle}`;
  const sharedInboxUri = sharedInbox ? `https://${instance.domain}/inbox` : null;
  await db.insert(ActivityPubActors).values({
    inboxUri: `${actorUri}/inbox`,
    profileId: profile.id,
    sharedInboxUri,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  return { actorUri, profile, sharedInboxUri };
};

const createPost = async (
  profileId: string,
  {
    media = [],
    replyParentId = null,
    repostSourceId = null,
    sensitiveMedia = false,
    visibility = PostVisibility.PUBLIC,
  }: {
    media?: readonly { readonly altText: string | null; readonly mediaId: string }[];
    replyParentId?: string | null;
    repostSourceId?: string | null;
    sensitiveMedia?: boolean;
    visibility?: PostVisibility;
  } = {},
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, replyParentId, repostSourceId, state: PostState.ACTIVE, visibility })
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
        summary: null,
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

const createMedia = async (
  profileId: string,
  storageReference: string,
  url: string,
  mediaType: string,
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
      accountId: account.id,
      mediaType,
      url,
      profileId,
      readyAt: Temporal.Now.instant(),
      source: MediaSource.LOCAL,
      state: MediaState.READY,
      storageReference,
      uploadExpiresAt: Temporal.Now.instant().add({ minutes: 5 }),
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
