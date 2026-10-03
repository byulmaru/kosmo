import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
  Profiles,
} from '../db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '../enums';
import { postContentDocumentFromText } from '../post-content/server';
import { createPost, deletePost } from './post';
import { applyPostQuoteConsent } from './post-quote-consent';
import type { InstanceKind as InstanceKindType } from '../enums';
import type { PostContentDocumentV1 } from '../post-content';

const publicOrigin = 'https://quote-consent.local.example';
process.env.PUBLIC_ORIGIN = publicOrigin;

before(async () => {
  const { seedDatabase } = await import('../db/seed');
  await seedDatabase({ publicOrigin });
});

after(async () => pg.end());

const createProfile = async (kind: InstanceKindType = InstanceKind.LOCAL) => {
  const suffix = crypto.randomUUID();
  const instance =
    kind === InstanceKind.LOCAL
      ? await db
          .select()
          .from(Instances)
          .where(eq(Instances.canonicalOrigin, publicOrigin))
          .limit(1)
          .then(firstOrThrow)
      : await db
          .insert(Instances)
          .values({
            domain: `${suffix}.example`,
            kind,
            state: InstanceState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow);
  const profile = await db
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
  const actorUri =
    kind === InstanceKind.LOCAL
      ? new URL(`/ap/actor/${profile.id}`, publicOrigin).href
      : new URL(`/users/${suffix}`, `https://${instance.domain}`).href;

  if (kind === InstanceKind.ACTIVITYPUB) {
    await db.insert(ActivityPubActors).values({
      profileId: profile.id,
      type: ActivityPubActorType.PERSON,
      uri: actorUri,
    });
  }

  return { actorUri, instance, profile };
};

const createRemotePost = async (profileId: string, uri: string, text: string) => {
  const content = await db
    .insert(PostContents)
    .values({ document: postContentDocumentFromText(text), postId: null })
    .returning()
    .then(firstOrThrow);
  const post = await db
    .insert(Posts)
    .values({
      currentContentId: content.id,
      profileId,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubPosts).values({
    postId: post.id,
    receivedAt: Temporal.Now.instant(),
    uri,
  });

  return { content, post };
};

const expectation = ({
  quote,
  quoteActorUri,
  quoteUri,
  source,
  sourceActorUri,
  sourceUri,
  expectedApprovalUri = null,
  expectedRepostSourceId = null,
  expectedStatus = null,
}: {
  quote: typeof Posts.$inferSelect;
  quoteActorUri: string;
  quoteUri: string;
  source: typeof Posts.$inferSelect;
  sourceActorUri: string;
  sourceUri: string;
  expectedApprovalUri?: string | null;
  expectedRepostSourceId?: string | null;
  expectedStatus?: PostQuoteConsentStatus | null;
}) => ({
  expectedApprovalUri,
  expectedRepostSourceId,
  expectedStatus,
  quote: {
    authorActorUri: quoteActorUri,
    postId: quote.id,
    profileId: quote.profileId,
    uri: quoteUri,
  },
  source: {
    authorActorUri: sourceActorUri,
    postId: source.id,
    profileId: source.profileId,
    uri: sourceUri,
  },
});

test('remote Quote resolution stores pending Authorization references and CASes Note refreshes', async () => {
  const sourceAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const quoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const sourceUri = `https://${sourceAuthor.instance.domain}/notes/source`;
  const quoteUri = `https://${quoteAuthor.instance.domain}/notes/quote`;
  const approvalUriA = `https://${sourceAuthor.instance.domain}/quote-authorizations/a`;
  const approvalUriB = `https://${sourceAuthor.instance.domain}/quote-authorizations/b`;
  const source = await createRemotePost(sourceAuthor.profile.id, sourceUri, 'Source body');
  const quote = await createRemotePost(quoteAuthor.profile.id, quoteUri, 'Quote body');
  const identity = expectation({
    quote: quote.post,
    quoteActorUri: quoteAuthor.actorUri,
    quoteUri,
    source: source.post,
    sourceActorUri: sourceAuthor.actorUri,
    sourceUri,
  });
  const boundExpectation = (
    expectedStatus: PostQuoteConsentStatus,
    expectedApprovalUri: string | null,
  ) => ({
    ...identity,
    expectedApprovalUri,
    expectedRepostSourceId: source.post.id,
    expectedStatus,
  });
  const identityMismatches = [
    { ...identity, quote: { ...identity.quote, uri: `${quoteUri}/stale` } },
    {
      ...identity,
      quote: { ...identity.quote, authorActorUri: `${quoteAuthor.actorUri}/stale` },
    },
    { ...identity, source: { ...identity.source, uri: `${sourceUri}/stale` } },
    {
      ...identity,
      source: { ...identity.source, authorActorUri: `${sourceAuthor.actorUri}/stale` },
    },
    { ...identity, expectedRepostSourceId: source.post.id },
  ];
  const mismatchedResults = await Promise.all(
    identityMismatches.map((expected) =>
      applyPostQuoteConsent({
        ...expected,
        operation: 'RESOLVE',
        result: 'PENDING',
        approvalUri: approvalUriA,
        quoteAuthorActorUri: quoteAuthor.actorUri,
      }),
    ),
  );
  assert.deepEqual(mismatchedResults, [null, null, null, null, null]);

  const remoteDecision = await applyPostQuoteConsent({
    ...identity,
    operation: 'DECIDE',
    result: 'APPROVED',
    issuerActorUri: sourceAuthor.actorUri,
  });
  assert.equal(remoteDecision, null);

  const directQuoteUri = `${quoteUri}/without-request`;
  const directQuote = await createRemotePost(
    quoteAuthor.profile.id,
    directQuoteUri,
    'Directly authorized Quote without Request',
  );
  const invalidSelfProof = await applyPostQuoteConsent({
    ...expectation({
      quote: directQuote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri: directQuoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: { kind: 'SELF' },
  });
  assert.equal(invalidSelfProof, null);

  const directAuthorizationUri = `${sourceUri}/quote-authorizations/direct`;
  const directlyApproved = await applyPostQuoteConsent({
    ...expectation({
      quote: directQuote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri: directQuoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: directAuthorizationUri,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(directlyApproved?.changed, true);
  assert.equal(directlyApproved?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(directlyApproved?.approvalUri, directAuthorizationUri);
  assert.equal(directlyApproved?.repostSourceId, source.post.id);

  const selfSourceUri = `https://${quoteAuthor.instance.domain}/notes/self-source`;
  const selfSource = await createRemotePost(
    quoteAuthor.profile.id,
    selfSourceUri,
    'Self-authorization Source',
  );
  const selfQuoteUri = `https://${quoteAuthor.instance.domain}/notes/self-quote`;
  const selfQuote = await createRemotePost(
    quoteAuthor.profile.id,
    selfQuoteUri,
    'Self-authorized Quote without Request',
  );
  const selfApproved = await applyPostQuoteConsent({
    ...expectation({
      quote: selfQuote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri: selfQuoteUri,
      source: selfSource.post,
      sourceActorUri: quoteAuthor.actorUri,
      sourceUri: selfSourceUri,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: { kind: 'SELF' },
  });
  assert.equal(selfApproved?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(selfApproved?.approvalUri, null);
  assert.equal(selfApproved?.repostSourceId, selfSource.post.id);

  const legacyQuoteUri = `https://${quoteAuthor.instance.domain}/notes/legacy-quote`;
  const legacyQuote = await createRemotePost(
    quoteAuthor.profile.id,
    legacyQuoteUri,
    'Legacy Quote URL without Request',
  );
  const legacyApproved = await applyPostQuoteConsent({
    ...expectation({
      quote: legacyQuote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri: legacyQuoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: { kind: 'LEGACY_QUOTE_URL' },
  });
  assert.equal(legacyApproved?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(legacyApproved?.approvalUri, null);

  const pending = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
    }),
    operation: 'RESOLVE',
    result: 'PENDING',
    approvalUri: approvalUriA,
    quoteAuthorActorUri: quoteAuthor.actorUri,
  });

  assert.equal(pending?.status, PostQuoteConsentStatus.PENDING);
  assert.equal(pending?.approvalUri, approvalUriA);
  assert.equal(pending?.repostSourceId, source.post.id);

  const otherSourceAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const otherSourceUri = `https://${otherSourceAuthor.instance.domain}/notes/other-source`;
  const otherSource = await createRemotePost(
    otherSourceAuthor.profile.id,
    otherSourceUri,
    'Alternate Source',
  );
  const wrongBoundSource = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: otherSource.post,
      sourceActorUri: otherSourceAuthor.actorUri,
      sourceUri: otherSourceUri,
      expectedApprovalUri: approvalUriA,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.PENDING,
    }),
    operation: 'RESOLVE',
    result: 'PENDING',
    approvalUri: approvalUriA,
    quoteAuthorActorUri: quoteAuthor.actorUri,
  });
  assert.equal(wrongBoundSource, null);

  const duplicateCreate = await createPost({
    document: postContentDocumentFromText('Duplicate Update content'),
    mentionProfileIds: [],
    objectUri: quoteUri,
    origin: 'ACTIVITYPUB',
    profileId: quoteAuthor.profile.id,
    publishedAt: null,
    receivedAt: Temporal.Now.instant(),
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(duplicateCreate.created, false);
  const materializedMapping = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, quoteUri))
    .then((rows) => {
      assert.equal(rows.length, 1);
      return firstOrThrow(rows);
    });
  assert.equal(materializedMapping.postId, quote.post.id);
  const materializedPost = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(materializedPost.quoteConsentStatus, PostQuoteConsentStatus.PENDING);
  assert.equal(materializedPost.repostSourceId, source.post.id);

  const invalidProof = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriA,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.PENDING,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriA,
      issuerActorUri: `https://${sourceAuthor.instance.domain}/users/other`,
    },
  });
  assert.equal(invalidProof, null);

  const approved = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriA,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.PENDING,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriA,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(approved?.status, PostQuoteConsentStatus.APPROVED);

  const directApprovedB = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriA,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.APPROVED,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriB,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(directApprovedB?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(directApprovedB?.approvalUri, approvalUriB);

  const staleApprovalA = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriA,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.APPROVED,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriA,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(staleApprovalA, null);
  const afterStaleApproval = await db
    .select({
      quoteConsentApprovalUri: Posts.quoteConsentApprovalUri,
      quoteConsentStatus: Posts.quoteConsentStatus,
    })
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(afterStaleApproval.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
  assert.equal(afterStaleApproval.quoteConsentApprovalUri, approvalUriB);

  const staleRevocation = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriB,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.APPROVED,
    }),
    operation: 'REVOKE',
    approvalUri: approvalUriA,
    issuerActorUri: sourceAuthor.actorUri,
  });
  assert.equal(staleRevocation, null);

  const refreshedPending = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriB,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.APPROVED,
    }),
    operation: 'RESOLVE',
    result: 'PENDING',
    approvalUri: approvalUriB,
    quoteAuthorActorUri: quoteAuthor.actorUri,
  });
  assert.equal(refreshedPending?.status, PostQuoteConsentStatus.PENDING);
  assert.equal(refreshedPending?.approvalUri, approvalUriB);

  const approvedB = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: quoteAuthor.actorUri,
      quoteUri,
      source: source.post,
      sourceActorUri: sourceAuthor.actorUri,
      sourceUri,
      expectedApprovalUri: approvalUriB,
      expectedRepostSourceId: source.post.id,
      expectedStatus: PostQuoteConsentStatus.PENDING,
    }),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriB,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(approvedB?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(approvedB?.approvalUri, approvalUriB);

  const refreshed = await applyPostQuoteConsent({
    ...boundExpectation(PostQuoteConsentStatus.APPROVED, approvalUriB),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriB,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(refreshed?.changed, false);
  assert.equal(refreshed?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(refreshed?.approvalUri, approvalUriB);

  const approvedA = await applyPostQuoteConsent({
    ...boundExpectation(PostQuoteConsentStatus.APPROVED, approvalUriB),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriA,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(approvedA?.changed, true);
  assert.equal(approvedA?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(approvedA?.approvalUri, approvalUriA);

  const preRevokeApprovalInput = {
    ...boundExpectation(PostQuoteConsentStatus.APPROVED, approvalUriA),
    operation: 'RESOLVE' as const,
    result: 'APPROVED' as const,
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION' as const,
      approvalUri: approvalUriA,
      issuerActorUri: sourceAuthor.actorUri,
    },
  };
  const revoked = await applyPostQuoteConsent({
    ...boundExpectation(PostQuoteConsentStatus.APPROVED, approvalUriA),
    operation: 'REVOKE',
    approvalUri: approvalUriA,
    issuerActorUri: sourceAuthor.actorUri,
  });
  assert.equal(revoked?.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(revoked?.approvalUri, approvalUriA);

  assert.equal(await applyPostQuoteConsent(preRevokeApprovalInput), null);

  const revokedExpectation = boundExpectation(PostQuoteConsentStatus.REVOKED, approvalUriA);
  const deniedReapprovals = await Promise.all([
    applyPostQuoteConsent({
      ...revokedExpectation,
      operation: 'RESOLVE',
      result: 'PENDING',
      approvalUri: approvalUriB,
      quoteAuthorActorUri: quoteAuthor.actorUri,
    }),
    applyPostQuoteConsent({
      ...revokedExpectation,
      operation: 'RESOLVE',
      result: 'APPROVED',
      quoteAuthorActorUri: quoteAuthor.actorUri,
      proof: { kind: 'SELF' },
    }),
    applyPostQuoteConsent({
      ...revokedExpectation,
      operation: 'RESOLVE',
      result: 'APPROVED',
      quoteAuthorActorUri: quoteAuthor.actorUri,
      proof: { kind: 'LEGACY_QUOTE_URL' },
    }),
    applyPostQuoteConsent({
      ...revokedExpectation,
      operation: 'RESOLVE',
      result: 'APPROVED',
      quoteAuthorActorUri: quoteAuthor.actorUri,
      proof: {
        kind: 'AUTHORIZATION',
        approvalUri: approvalUriA,
        issuerActorUri: `${sourceAuthor.actorUri}/wrong-issuer`,
      },
    }),
  ]);
  assert.deepEqual(deniedReapprovals, [null, null, null, null]);

  const stillRevoked = await db
    .select({
      quoteConsentApprovalUri: Posts.quoteConsentApprovalUri,
      quoteConsentStatus: Posts.quoteConsentStatus,
    })
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(stillRevoked.quoteConsentStatus, PostQuoteConsentStatus.REVOKED);
  assert.equal(stillRevoked.quoteConsentApprovalUri, approvalUriA);

  const sameReferenceReapproval = await applyPostQuoteConsent({
    ...revokedExpectation,
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriA,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(sameReferenceReapproval?.changed, true);
  assert.equal(sameReferenceReapproval?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(sameReferenceReapproval?.approvalUri, approvalUriA);

  const revokedAgain = await applyPostQuoteConsent({
    ...boundExpectation(PostQuoteConsentStatus.APPROVED, approvalUriA),
    operation: 'REVOKE',
    approvalUri: approvalUriA,
    issuerActorUri: sourceAuthor.actorUri,
  });
  assert.equal(revokedAgain?.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(revokedAgain?.approvalUri, approvalUriA);

  const replacementReapproval = await applyPostQuoteConsent({
    ...boundExpectation(PostQuoteConsentStatus.REVOKED, approvalUriA),
    operation: 'RESOLVE',
    result: 'APPROVED',
    quoteAuthorActorUri: quoteAuthor.actorUri,
    proof: {
      kind: 'AUTHORIZATION',
      approvalUri: approvalUriB,
      issuerActorUri: sourceAuthor.actorUri,
    },
  });
  assert.equal(replacementReapproval?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(replacementReapproval?.approvalUri, approvalUriB);

  const persistedQuote = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(persistedQuote.currentContentId, quote.content.id);
});

test('Quote decisions and local Authorization revocation preserve authored Quote content', async () => {
  const localAuthor = await createProfile();
  const remoteQuoteAuthor = await createProfile(InstanceKind.ACTIVITYPUB);
  const sourceResult = await createPost({
    document: postContentDocumentFromText('Local Source body'),
    origin: 'LOCAL',
    profileId: localAuthor.profile.id,
    visibility: PostVisibility.PUBLIC,
  });
  const localSourceUri = new URL(`/ap/note/${sourceResult.post.id}`, publicOrigin).href;
  const remoteQuoteUri = `https://${remoteQuoteAuthor.instance.domain}/notes/quote`;
  const quote = await createRemotePost(
    remoteQuoteAuthor.profile.id,
    remoteQuoteUri,
    'Remote Quote body',
  );

  const rejected = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: remoteQuoteAuthor.actorUri,
      quoteUri: remoteQuoteUri,
      source: sourceResult.post,
      sourceActorUri: localAuthor.actorUri,
      sourceUri: localSourceUri,
    }),
    operation: 'DECIDE',
    result: 'REJECTED',
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(rejected?.status, PostQuoteConsentStatus.REJECTED);
  assert.equal(rejected?.approvalUri, null);

  const lateApproval = await applyPostQuoteConsent({
    ...expectation({
      quote: quote.post,
      quoteActorUri: remoteQuoteAuthor.actorUri,
      quoteUri: remoteQuoteUri,
      source: sourceResult.post,
      sourceActorUri: localAuthor.actorUri,
      sourceUri: localSourceUri,
      expectedRepostSourceId: sourceResult.post.id,
      expectedStatus: PostQuoteConsentStatus.REJECTED,
    }),
    operation: 'DECIDE',
    result: 'APPROVED',
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(lateApproval, null);

  const grantQuoteUri = `${remoteQuoteUri}-grant`;
  const grantQuote = await createRemotePost(
    remoteQuoteAuthor.profile.id,
    grantQuoteUri,
    'Remote Quote with local grant',
  );
  const localGrantExpectation = (expectedStatus: PostQuoteConsentStatus | null = null) =>
    expectation({
      quote: grantQuote.post,
      quoteActorUri: remoteQuoteAuthor.actorUri,
      quoteUri: grantQuoteUri,
      source: sourceResult.post,
      sourceActorUri: localAuthor.actorUri,
      sourceUri: localSourceUri,
      expectedApprovalUri: null,
      expectedRepostSourceId: expectedStatus === null ? null : sourceResult.post.id,
      expectedStatus,
    });
  const localGrant = await applyPostQuoteConsent({
    ...localGrantExpectation(),
    operation: 'DECIDE',
    result: 'APPROVED',
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(localGrant?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(localGrant?.approvalUri, null);

  const localAuthorizationUri = new URL(
    `/ap/quote-authorization/${grantQuote.post.id}`,
    publicOrigin,
  ).href;
  const invalidLocalRevocation = await applyPostQuoteConsent({
    ...localGrantExpectation(PostQuoteConsentStatus.APPROVED),
    operation: 'REVOKE',
    approvalUri: `${localAuthorizationUri}-stale`,
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(invalidLocalRevocation, null);

  const localRevocation = await applyPostQuoteConsent({
    ...localGrantExpectation(PostQuoteConsentStatus.APPROVED),
    operation: 'REVOKE',
    approvalUri: localAuthorizationUri,
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(localRevocation?.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(localRevocation?.approvalUri, null);

  const rejectedReapproval = await applyPostQuoteConsent({
    ...localGrantExpectation(PostQuoteConsentStatus.REVOKED),
    operation: 'DECIDE',
    result: 'REJECTED',
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(rejectedReapproval, null);

  const localReapproval = await applyPostQuoteConsent({
    ...localGrantExpectation(PostQuoteConsentStatus.REVOKED),
    operation: 'DECIDE',
    result: 'APPROVED',
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(localReapproval?.status, PostQuoteConsentStatus.APPROVED);
  assert.equal(localReapproval?.approvalUri, null);

  const localReapprovalRevocation = await applyPostQuoteConsent({
    ...localGrantExpectation(PostQuoteConsentStatus.APPROVED),
    operation: 'REVOKE',
    approvalUri: localAuthorizationUri,
    issuerActorUri: localAuthor.actorUri,
  });
  assert.equal(localReapprovalRevocation?.status, PostQuoteConsentStatus.REVOKED);
  assert.equal(localReapprovalRevocation?.approvalUri, null);
  const persistedGrantQuote = await db
    .select({ currentContentId: Posts.currentContentId })
    .from(Posts)
    .where(eq(Posts.id, grantQuote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(persistedGrantQuote.currentContentId, grantQuote.content.id);

  const localQuoteDocument: PostContentDocumentV1 = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Local Quote body with link',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/quote-source' } }],
            },
          ],
        },
      ],
    },
  };
  const localQuote = await createPost({
    document: localQuoteDocument,
    origin: 'LOCAL',
    profileId: remoteQuoteAuthor.profile.id,
    repostSourceId: sourceResult.post.id,
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(localQuote.post.quoteConsentStatus, PostQuoteConsentStatus.APPROVED);
  assert.equal(localQuote.post.quoteConsentApprovalUri, null);

  await deletePost({
    actorProfileId: localAuthor.profile.id,
    origin: 'LOCAL',
    postId: sourceResult.post.id,
  });

  const persistedQuote = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, localQuote.post.id))
    .limit(1)
    .then(firstOrThrow);
  assert.equal(persistedQuote.quoteConsentStatus, PostQuoteConsentStatus.REVOKED);
  assert.equal(persistedQuote.currentContentId, localQuote.post.currentContentId);
  const persistedContent = await db
    .select({ document: PostContents.document })
    .from(PostContents)
    .where(eq(PostContents.id, localQuote.post.currentContentId!))
    .limit(1)
    .then(firstOrThrow);
  assert.deepEqual(persistedContent.document, localQuoteDocument);
});
