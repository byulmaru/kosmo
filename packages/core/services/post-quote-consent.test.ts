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
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostQuoteEffectKind,
  PostQuoteEffectReceiptStatus,
  PostQuotePolicy,
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
  replayPendingPostQuoteEffects,
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

  assert.equal(
    await db
      .select({ policy: PostQuotePolicies.policy })
      .from(PostQuotePolicies)
      .where(eq(PostQuotePolicies.postId, post.post.id))
      .then(firstOrThrow)
      .then(({ policy }) => policy),
    PostQuotePolicy.EVERYONE,
  );
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
  assert.equal(
    await db
      .select({ policy: PostQuotePolicies.policy })
      .from(PostQuotePolicies)
      .where(eq(PostQuotePolicies.postId, post.post.id))
      .then(firstOrThrow)
      .then(({ policy }) => policy),
    PostQuotePolicy.FOLLOWERS,
  );
  const receipt = await db
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.postId, post.post.id))
    .then(firstOrThrow);
  assert.equal(receipt.effectKind, PostQuoteEffectKind.POLICY_UPDATE);
  assert.equal(receipt.revision, 2);
  assert.equal(receipt.status, 'PENDING');
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

test('pending effect replay는 앞 batch 실패와 무관하게 101번째 receipt까지 진행한다', async (t) => {
  const author = await createProfile();
  const post = await createPost({
    document: postContentDocumentFromText('replay backlog'),
    origin: 'LOCAL',
    profileId: author.id,
    visibility: PostVisibility.PUBLIC,
  });
  const backlog = await db
    .insert(PostQuoteEffectReceipts)
    .values(
      Array.from({ length: 101 }, (_, index) => ({
        effectKey: `test-post-quote-backlog:${post.post.id}:${index}`,
        effectKind: PostQuoteEffectKind.POLICY_UPDATE,
        postId: post.post.id,
        revision: 1000 + index,
      })),
    )
    .returning();
  const firstReceipt = backlog[0];
  const tailReceipt = backlog.at(-1);
  assert.ok(firstReceipt && tailReceipt);
  const start = t.mock.method(temporalClient.workflow, 'start', async (_workflow, options) => {
    if (options.workflowId === `post-quote-policy-effects:${post.post.id}:1000`) {
      throw new Error('poison receipt');
    }
    return undefined as never;
  });

  await replayPendingPostQuoteEffects(100);

  assert.ok(
    start.mock.calls.some(
      ({ arguments: [, options] }) =>
        options.workflowId === `post-quote-policy-effects:${post.post.id}:1100`,
    ),
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
    await canDisplayQuoteSource(db, {
      quotePostId: quote.post.id,
      sourcePostId: source.post.id,
      viewerProfileId: viewer.id,
    }),
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

test('Remote Source 삭제는 Local Quote audience 갱신 receipt를 남긴다', async () => {
  const sourceAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const quoteAuthor = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('remote source'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('local quote'),
    origin: 'LOCAL',
    profileId: quoteAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  await db.update(Posts).set({ repostSourceId: source.post.id }).where(eq(Posts.id, quote.post.id));
  const consent = await db
    .insert(PostQuoteConsents)
    .values({
      approvalUri: 'https://remote-source.example/quote-authorizations/local-quote',
      quoteAuthorActorUri: `https://${quoteAuthor.displayName}.example/ap/actor/${quoteAuthor.id}`,
      quoteAuthorProfileId: quoteAuthor.id,
      quotePostId: quote.post.id,
      quoteUri: `https://${quoteAuthor.displayName}.example/ap/note/${quote.post.id}`,
      requestUri: `https://${quoteAuthor.displayName}.example/ap/quote-request/${quote.post.id}`,
      sourceAuthorActorUri: 'https://remote-source.example/users/author',
      sourcePostId: source.post.id,
      sourceUri: 'https://remote-source.example/notes/source',
      status: PostQuoteConsentStatus.APPROVED,
    })
    .returning()
    .then(firstOrThrow);

  await deletePost({
    actorProfileId: sourceAuthor.id,
    origin: 'ACTIVITYPUB',
    postId: source.post.id,
  });

  const receipt = await db
    .select()
    .from(PostQuoteEffectReceipts)
    .where(eq(PostQuoteEffectReceipts.consentId, consent.id))
    .then(firstOrThrow);
  assert.equal(receipt.effectKind, PostQuoteEffectKind.CONSENT_UPDATE);
  assert.equal(receipt.postId, quote.post.id);
  assert.equal(receipt.revision, 2);
});
