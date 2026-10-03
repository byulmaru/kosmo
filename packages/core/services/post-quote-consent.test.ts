import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { eq, sql } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  Posts,
  ProfileBlocks,
  ProfileFollows,
  Profiles,
} from '../db';
import {
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost, deletePost } from './post';
import {
  canDisplayQuoteSource,
  postQuoteConsentColumns,
  recordInboundQuoteRequest,
  visibleQuoteSources,
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

const waitUntilBlockedBy = async (blockingPid: number) => {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const [activity] = await db.execute<{ blocked: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE ${blockingPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked
    `);
    if (activity?.blocked) {
      return;
    }
    await delay(20);
  }
  assert.fail('Quote authorization did not wait for the Source transaction');
};

test('Local content-bearing Post는 작성 시 선택한 quote policy와 기본값을 저장한다', async () => {
  const author = await createProfile();
  for (const policy of [undefined, PostQuotePolicy.AUTHOR, PostQuotePolicy.FOLLOWERS]) {
    const post = await createPost({
      document: postContentDocumentFromText('policy'),
      origin: 'LOCAL',
      profileId: author.id,
      quotePolicy: policy,
      visibility: PostVisibility.PUBLIC,
    });
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, post.post.id)).then(firstOrThrow))
        .quotePolicy,
      policy ?? PostQuotePolicy.EVERYONE,
    );
  }
});

test('승인된 Quote Source 조회는 방향별 Block을 적용한다', async () => {
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

test('batch Source 판정은 승인 상태·자기 인용·순수 Repost와 viewer 접근을 독립 적용한다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const viewer = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quotes = [];
  for (const status of [
    PostQuoteConsentStatus.APPROVED,
    PostQuoteConsentStatus.PENDING,
    PostQuoteConsentStatus.REJECTED,
    PostQuoteConsentStatus.REVOKED,
    null,
  ]) {
    const quote = await createPost({
      document: postContentDocumentFromText('quote'),
      origin: 'LOCAL',
      profileId: quoteAuthor.id,
      repostSourceId: source.post.id,
      visibility: PostVisibility.PUBLIC,
    });
    if (status) {
      await db.update(Posts).set({ quoteConsentStatus: status }).where(eq(Posts.id, quote.post.id));
    } else {
      await db
        .update(Posts)
        .set({
          quoteConsentSourcePostId: null,
          quoteConsentSourceUri: null,
          quoteConsentSourceAuthorActorUri: null,
          quoteConsentQuoteUri: null,
          quoteConsentQuoteAuthorActorUri: null,
          quoteConsentRequestUri: null,
          quoteConsentApprovalUri: null,
          quoteConsentStatus: null,
          quoteConsentRevision: null,
        })
        .where(eq(Posts.id, quote.post.id));
    }
    quotes.push({ quotePostId: quote.post.id, sourcePostId: source.post.id });
  }
  const selfQuote = await createPost({
    document: postContentDocumentFromText('self'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.PUBLIC,
  });
  const repost = await db
    .insert(Posts)
    .values({
      profileId: quoteAuthor.id,
      repostSourceId: source.post.id,
      visibility: PostVisibility.PUBLIC,
      state: PostState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  quotes.push(
    { quotePostId: selfQuote.post.id, sourcePostId: source.post.id },
    { quotePostId: repost.id, sourcePostId: source.post.id },
  );
  const allowed = [quotes[0], quotes[5], quotes[6]];
  const read = (viewerProfileId: string | null = viewer.id) =>
    visibleQuoteSources(db, { quotes, viewerProfileId });
  assert.deepEqual(await read(), allowed);
  assert.deepEqual(await read(null), allowed);
  await db
    .insert(ProfileBlocks)
    .values({ ownerProfileId: viewer.id, targetProfileId: sourceAuthor.id });
  assert.deepEqual(await read(), allowed);
  const block = await db
    .insert(ProfileBlocks)
    .values({ ownerProfileId: sourceAuthor.id, targetProfileId: viewer.id })
    .returning()
    .then(firstOrThrow);
  assert.deepEqual(await read(), []);
  await db.delete(ProfileBlocks).where(eq(ProfileBlocks.id, block.id));
  await db
    .update(Posts)
    .set({ visibility: PostVisibility.FOLLOWERS })
    .where(eq(Posts.id, source.post.id));
  assert.deepEqual(await read(), []);
  assert.deepEqual(await read(null), []);
  await db
    .insert(ProfileFollows)
    .values({ followerProfileId: viewer.id, followeeProfileId: sourceAuthor.id });
  assert.deepEqual(await read(), allowed);
  // Preserve the existing direct Source-author read rule for Followers Only.
  assert.deepEqual(await read(sourceAuthor.id), quotes);
  await db
    .update(Posts)
    .set({ visibility: PostVisibility.DIRECT })
    .where(eq(Posts.id, source.post.id));
  assert.deepEqual(await read(sourceAuthor.id), []);
  await db
    .update(Posts)
    .set({ visibility: PostVisibility.UNLISTED })
    .where(eq(Posts.id, source.post.id));
  assert.deepEqual(await read(), allowed);
  await db
    .update(Profiles)
    .set({ state: ProfileState.DISABLED })
    .where(eq(Profiles.id, quoteAuthor.id));
  assert.deepEqual(await read(), [quotes[5]]);
  await db
    .update(Profiles)
    .set({ state: ProfileState.ACTIVE })
    .where(eq(Profiles.id, quoteAuthor.id));
  await db
    .update(Instances)
    .set({ state: InstanceState.SUSPENDED })
    .where(eq(Instances.id, sourceAuthor.instanceId));
  assert.deepEqual(await read(), []);
  await db
    .update(Instances)
    .set({ state: InstanceState.ACTIVE })
    .where(eq(Instances.id, sourceAuthor.instanceId));
  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, source.post.id));
  assert.deepEqual(await read(), []);
});

test('Local Source 삭제는 승인 lifecycle을 철회한다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const source = await createPost({
    document: postContentDocumentFromText('source'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('remote quote'),
    objectUri: 'https://remote.example/notes/quote',
    origin: 'ACTIVITYPUB',
    mentionProfileIds: [],
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    profileId: quoteAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  assert.ok(quote.created);
  const sourceUri = `https://${sourceAuthor.displayName}.example/ap/note/${source.post.id}`;
  const quoteUri = 'https://remote.example/notes/quote';
  const requestUri = 'https://remote.example/quote-requests/quote';
  const approvalUri = 'https://source.example/ap/quote-authorization/quote';
  await db
    .update(Posts)
    .set({
      quoteConsentApprovalUri: approvalUri,
      quoteConsentQuoteAuthorActorUri: 'https://remote.example/users/quote',
      quoteConsentQuoteUri: quoteUri,
      quoteConsentRequestUri: requestUri,
      quoteConsentSourceAuthorActorUri: `https://${sourceAuthor.displayName}.example/ap/actor/${sourceAuthor.id}`,
      quoteConsentSourcePostId: source.post.id,
      quoteConsentSourceUri: sourceUri,
      quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      quoteConsentRevision: 1,
    })
    .where(eq(Posts.id, quote.post.id));

  await deletePost({
    actorProfileId: sourceAuthor.id,
    origin: 'LOCAL',
    postId: source.post.id,
  });

  const consent = await db
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.quoteConsentRequestUri, requestUri))
    .then(firstOrThrow);
  assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(consent.revision, 2);
});

test('Source 삭제와 경합한 원격 QuoteRequest는 삭제 뒤 승인되지 않는다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const source = await createPost({
    document: postContentDocumentFromText('source race'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quote = await createPost({
    document: postContentDocumentFromText('remote race quote'),
    objectUri: 'https://remote.example/notes/race',
    origin: 'ACTIVITYPUB',
    mentionProfileIds: [],
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    profileId: quoteAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  assert.ok(quote.created);
  const sourceLocked = Promise.withResolvers<number>();
  const allowDelete = Promise.withResolvers<void>();
  const deletion = db.transaction(async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid()::int AS pid`,
    );
    assert.ok(connection);
    await tx
      .select({ id: Posts.id })
      .from(Posts)
      .where(eq(Posts.id, source.post.id))
      .for('update', { of: Posts });
    sourceLocked.resolve(connection.pid);
    await allowDelete.promise;
    await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(eq(Posts.id, source.post.id));
  });

  const blockingPid = await sourceLocked.promise;
  const request = recordInboundQuoteRequest({
    approvalUri: 'https://source.example/quote-authorizations/race',
    quoteAuthorActorUri: 'https://remote.example/users/quote',
    quoteAuthorProfileId: quoteAuthor.id,
    quotePostId: quote.post.id,
    quoteUri: 'https://remote.example/notes/race',
    requestUri: 'https://remote.example/quote-requests/race',
    sourceAuthorActorUri: `https://${sourceAuthor.displayName}.example/ap/actor/${sourceAuthor.id}`,
    sourcePostId: source.post.id,
    sourceUri: `https://${sourceAuthor.displayName}.example/ap/note/${source.post.id}`,
  });
  await waitUntilBlockedBy(blockingPid);
  allowDelete.resolve();

  const [, result] = await Promise.all([deletion, request]);
  assert.equal(result.accepted, false);
  assert.equal(result.consent.status, PostQuoteConsentStatus.REJECTED);
});

test('Source 삭제와 경합한 Local Quote 작성은 삭제 뒤 실패한다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile();
  const source = await createPost({
    document: postContentDocumentFromText('local source race'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const sourceLocked = Promise.withResolvers<number>();
  const allowDelete = Promise.withResolvers<void>();
  const deletion = db.transaction(async (tx) => {
    const [connection] = await tx.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid()::int AS pid`,
    );
    assert.ok(connection);
    await tx
      .select({ id: Posts.id })
      .from(Posts)
      .where(eq(Posts.id, source.post.id))
      .for('update', { of: Posts });
    sourceLocked.resolve(connection.pid);
    await allowDelete.promise;
    await tx
      .update(Posts)
      .set({ deletedAt: sql`now()`, state: PostState.DELETED })
      .where(eq(Posts.id, source.post.id));
  });

  const blockingPid = await sourceLocked.promise;
  const quote = createPost({
    document: postContentDocumentFromText('local quote race'),
    origin: 'LOCAL',
    profileId: quoteAuthor.id,
    repostSourceId: source.post.id,
    visibility: PostVisibility.PUBLIC,
  });
  await waitUntilBlockedBy(blockingPid);
  allowDelete.resolve();

  await deletion;
  await assert.rejects(quote, /Post not found/);
});

test('Remote Source 삭제는 Local Quote 동의를 철회한다', async () => {
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
    .update(Posts)
    .set({
      quoteConsentApprovalUri: 'https://remote-source.example/quote-authorizations/local-quote',
      quoteConsentQuoteAuthorActorUri: `https://${quoteAuthor.displayName}.example/ap/actor/${quoteAuthor.id}`,
      quoteConsentQuoteUri: `https://${quoteAuthor.displayName}.example/ap/note/${quote.post.id}`,
      quoteConsentRequestUri: `https://${quoteAuthor.displayName}.example/ap/quote-request/${quote.post.id}`,
      quoteConsentSourceAuthorActorUri: 'https://remote-source.example/users/author',
      quoteConsentSourcePostId: source.post.id,
      quoteConsentSourceUri: 'https://remote-source.example/notes/source',
      quoteConsentStatus: PostQuoteConsentStatus.APPROVED,
      quoteConsentRevision: 1,
    })
    .where(eq(Posts.id, quote.post.id))
    .returning(postQuoteConsentColumns)
    .then(firstOrThrow);

  await deletePost({
    actorProfileId: sourceAuthor.id,
    origin: 'ACTIVITYPUB',
    postId: source.post.id,
  });
  const revoked = await db
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.id, consent.id))
    .then(firstOrThrow);
  assert.equal(revoked.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(revoked.revision, consent.revision + 1);
});

test('같은 Quote의 재요청은 최초 승인 식별자를 보존하고 다른 Source로 바꿀 수 없다', async () => {
  const sourceAuthor = await createProfile();
  const quoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const source = await createPost({
    document: postContentDocumentFromText('source binding'),
    origin: 'LOCAL',
    profileId: sourceAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  const quoteUri = `https://remote.example/notes/${quoteAuthor.id}`;
  const quote = await createPost({
    document: postContentDocumentFromText('remote quote binding'),
    objectUri: quoteUri,
    origin: 'ACTIVITYPUB',
    mentionProfileIds: [],
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    profileId: quoteAuthor.id,
    visibility: PostVisibility.PUBLIC,
  });
  assert.ok(quote.created);
  const input = {
    approvalUri: `https://source.example/authorizations/${quote.post.id}`,
    quoteAuthorActorUri: `https://remote.example/users/${quoteAuthor.id}`,
    quoteAuthorProfileId: quoteAuthor.id,
    quotePostId: quote.post.id,
    quoteUri,
    requestUri: `https://remote.example/requests/${quote.post.id}`,
    sourceAuthorActorUri: `https://${sourceAuthor.displayName}.example/ap/actor/${sourceAuthor.id}`,
    sourcePostId: source.post.id,
    sourceUri: `https://${sourceAuthor.displayName}.example/ap/note/${source.post.id}`,
  };
  const first = await recordInboundQuoteRequest(input);
  assert.equal(first.accepted, true);
  assert.equal(first.consent.id, quote.post.id);
  assert.deepEqual(await recordInboundQuoteRequest(input), first);
  assert.deepEqual(
    await recordInboundQuoteRequest({
      ...input,
      requestUri: `${input.requestUri}-retry`,
      approvalUri: `${input.approvalUri}-retry`,
    }),
    first,
  );
  await assert.rejects(
    recordInboundQuoteRequest({ ...input, sourcePostId: quote.post.id, sourceUri: quoteUri }),
    /Quote consent binding/,
  );
  const stored = await db
    .select(postQuoteConsentColumns)
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .then(firstOrThrow);
  assert.deepEqual(stored, first.consent);
  const post = await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow);
  assert.equal(post.repostSourceId, null);
  assert.ok(post.currentContentId);
});
