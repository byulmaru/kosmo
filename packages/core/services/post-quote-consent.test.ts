import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  PostQuoteConsents,
  PostQuoteEffectReceipts,
  PostQuotePolicies,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostQuoteEffectKind,
  PostQuoteEffectReceiptStatus,
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { temporalClient } from '../temporal/client';
import { createPost, deletePost } from './post';
import {
  canDisplayQuoteSource,
  completePostQuoteEffectReceipt,
  getPostQuotePolicy,
  replayPendingPostQuoteEffects,
  sourceCanBeQuotedBy,
  updatePostQuotePolicy,
} from './post-quote-consent';

after(async () => pg.end());

const createProfile = async (kind: InstanceKind = InstanceKind.LOCAL) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${suffix}.example`,
      domain: `${suffix}.example`,
      kind,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  return db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      instanceId: instance.id,
      normalizedHandle: suffix,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
};

test('Local content-bearing Post는 quote policy를 기본값과 함께 저장하고 작성자만 변경한다', async () => {
  const author = await createProfile();
  const other = await createProfile();
  const post = await createPost({
    document: postContentDocumentFromText('policy'),
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });

  assert.equal(await getPostQuotePolicy(post.post.id), PostQuotePolicy.EVERYONE);
  await assert.rejects(
    updatePostQuotePolicy({
      actorProfileId: other.id,
      policy: PostQuotePolicy.AUTHOR,
      postId: post.post.id,
    }),
    /Post author permission is required/,
  );
  assert.equal(
    await updatePostQuotePolicy({
      actorProfileId: author.id,
      policy: PostQuotePolicy.FOLLOWERS,
      postId: post.post.id,
    }),
    PostQuotePolicy.FOLLOWERS,
  );
  assert.equal(await getPostQuotePolicy(post.post.id), PostQuotePolicy.FOLLOWERS);
  const receipt = await db
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.postId, post.post.id))
    .then(firstOrThrow);
  assert.equal(receipt.effectKind, PostQuoteEffectKind.POLICY_UPDATE);
  assert.equal(receipt.revision, 2);
  assert.equal(receipt.status, 'PENDING');
});

test('quote policy는 Content 없는 Repost와 remote Post에 합성되지 않는다', async () => {
  const author = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const repost = await db
    .insert(Posts)
    .values({
      profileId: author.id,
      repostSourceId: source.post.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.UNLISTED,
    })
    .returning()
    .then(firstOrThrow);

  assert.equal(await getPostQuotePolicy(repost.id), null);
});

test('pending effect receipt는 Worker 재시작에서 같은 workflow identity로 bounded replay된다', async (t) => {
  const author = await createProfile();
  const post = await createPost({
    document: postContentDocumentFromText('replay'),
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const receipt = await db
    .insert(PostQuoteEffectReceipts)
    .values({
      effectKey: `test-post-quote-policy:${post.post.id}:77`,
      effectKind: PostQuoteEffectKind.POLICY_UPDATE,
      postId: post.post.id,
      revision: 77,
    })
    .returning()
    .then(firstOrThrow);
  const start = t.mock.method(temporalClient.workflow, 'start', async () => undefined as never);

  const replayed = await replayPendingPostQuoteEffects();

  assert.ok(replayed >= 1);
  const replayCall = start.mock.calls.find((call) => {
    const options = call.arguments[1];
    return (
      options &&
      typeof options === 'object' &&
      'workflowId' in options &&
      options.workflowId === `post-quote-policy-effects:${post.post.id}:77`
    );
  });
  assert.ok(replayCall);
  const replayOptions = replayCall.arguments[1];
  assert.ok(replayOptions && typeof replayOptions === 'object' && 'args' in replayOptions);
  assert.deepEqual(replayOptions.args, [
    { postId: post.post.id, receiptId: receipt.id, revision: 77 },
  ]);

  await completePostQuoteEffectReceipt(receipt.id);
  assert.equal(
    await db
      .select({ status: PostQuoteEffectReceipts.status })
      .from(PostQuoteEffectReceipts)
      .where(eq(PostQuoteEffectReceipts.id, receipt.id))
      .then(firstOrThrow)
      .then(({ status }) => status),
    PostQuoteEffectReceiptStatus.COMPLETED,
  );
});

test('quote eligibility는 정책·실제 Follow·양방향 Block을 적용하고 기존 승인은 유지한다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const viewer = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('quote'),
    origin: 'LOCAL',
    profileId: quoteAuthor.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.PUBLIC,
  });

  assert.equal(
    await sourceCanBeQuotedBy(db, { actorProfileId: quoteAuthor.id, sourcePostId: source.post.id }),
    true,
  );
  assert.equal(
    await canDisplayQuoteSource(db, {
      quotePostId: quote.post.id,
      sourcePostId: source.post.id,
      viewerProfileId: viewer.id,
    }),
    true,
  );

  await updatePostQuotePolicy({
    actorProfileId: sourceAuthor.id,
    policy: PostQuotePolicy.AUTHOR,
    postId: source.post.id,
  });
  assert.equal(
    await sourceCanBeQuotedBy(db, { actorProfileId: viewer.id, sourcePostId: source.post.id }),
    false,
  );
  assert.equal(
    await canDisplayQuoteSource(db, {
      quotePostId: quote.post.id,
      sourcePostId: source.post.id,
      viewerProfileId: viewer.id,
    }),
    true,
  );

  await db
    .update(PostQuotePolicies)
    .set({ policy: PostQuotePolicy.FOLLOWERS })
    .where(eq(PostQuotePolicies.postId, source.post.id));
  assert.equal(
    await sourceCanBeQuotedBy(db, { actorProfileId: viewer.id, sourcePostId: source.post.id }),
    false,
  );
  await db.insert(ProfileFollows).values({
    followerProfileId: viewer.id,
    followeeProfileId: sourceAuthor.id,
  });
  assert.equal(
    await sourceCanBeQuotedBy(db, { actorProfileId: viewer.id, sourcePostId: source.post.id }),
    true,
  );

  await db.insert(ProfileBlocks).values({
    ownerProfileId: sourceAuthor.id,
    targetProfileId: viewer.id,
  });
  assert.equal(
    await canDisplayQuoteSource(db, {
      quotePostId: quote.post.id,
      sourcePostId: source.post.id,
      viewerProfileId: viewer.id,
    }),
    false,
  );
  await db.delete(ProfileBlocks);
  await db.insert(ProfileBlocks).values({
    ownerProfileId: viewer.id,
    targetProfileId: sourceAuthor.id,
  });
  assert.equal(
    await canDisplayQuoteSource(db, {
      quotePostId: quote.post.id,
      sourcePostId: source.post.id,
      viewerProfileId: viewer.id,
    }),
    true,
  );
});

test('Local Source 삭제는 승인 lifecycle과 동일 transaction에 원격 철회 receipt를 남긴다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const sourceUri = `https://${sourceAuthor.displayName}.example/ap/note/${source.post.id}`;
  const quoteUri = 'https://remote.example/notes/quote';
  const requestUri = 'https://remote.example/quote-requests/quote';
  const approvalUri = 'https://source.example/ap/quote-authorization/quote';
  await db.insert(PostQuoteConsents).values({
    approvalUri,
    quoteAuthorActorUri: 'https://remote.example/users/quote',
    quoteAuthorProfileId: quoteAuthor.id,
    quotePostId: null,
    quoteUri,
    requestUri,
    sourceAuthorActorUri: `https://${sourceAuthor.displayName}.example/ap/actor/${sourceAuthor.id}`,
    sourcePostId: source.post.id,
    sourceUri,
    status: PostQuoteConsentStatus.APPROVED,
  });

  await deletePost({
    actorProfileId: sourceAuthor.id,
    origin: 'LOCAL',
    postId: source.post.id,
  });

  const consent = await db
    .select()
    .from(PostQuoteConsents)
    .where(eq(PostQuoteConsents.requestUri, requestUri))
    .then(firstOrThrow);
  assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(consent.revision, 2);
  const receipt = await db
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.consentId, consent.id))
    .then(firstOrThrow);
  assert.equal(receipt.effectKind, PostQuoteEffectKind.SOURCE_REVOCATION);
  assert.equal(receipt.approvalUri, approvalUri);
  assert.equal(receipt.sourcePostId, source.post.id);
  assert.equal(receipt.status, 'PENDING');
});
