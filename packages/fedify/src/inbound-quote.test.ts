import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { generateCryptoKeyPair, signRequest } from '@fedify/fedify';
import { quoteInteraction } from '@fedify/interaction-controls';
import {
  Create,
  CryptographicKey,
  Delete,
  Note,
  Person,
  PUBLIC_COLLECTION,
  Update,
} from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import {
  ActivityPubActorType,
  ActivityPubQuoteFormat,
  ActivityPubQuoteStatus,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import { eq, ne } from 'drizzle-orm';
import type * as CoreDb from '@kosmo/core/db';
import type * as CoreSeed from '@kosmo/core/db/seed';
import type * as CoreServices from '@kosmo/core/services';
import type { createKosmoFederation as createKosmoFederationType } from './federation';
import type { handleInboundCreate as handleInboundCreateType } from './inbound-create';
import type {
  handleInboundQuote as handleInboundQuoteType,
  resolveStoredInboundQuote as resolveStoredInboundQuoteType,
  revokeInboundQuote as revokeInboundQuoteType,
} from './inbound-quote';
import type { handleInboundUpdate as handleInboundUpdateType } from './inbound-update';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const receivedAt = Temporal.Instant.from('2026-09-11T00:00:00Z');

let ActivityPubActors: typeof CoreDb.ActivityPubActors;
let ActivityPubPostQuotes: typeof CoreDb.ActivityPubPostQuotes;
let ActivityPubPosts: typeof CoreDb.ActivityPubPosts;
let db: typeof CoreDb.db;
let firstOrThrow: typeof CoreDb.firstOrThrow;
let Instances: typeof CoreDb.Instances;
let pg: typeof CoreDb.pg;
let PostContents: typeof CoreDb.PostContents;
let Posts: typeof CoreDb.Posts;
let ProfileFollows: typeof CoreDb.ProfileFollows;
let Profiles: typeof CoreDb.Profiles;
let createPost: typeof CoreServices.createPost;
let createKosmoFederation: typeof createKosmoFederationType;
let handleInboundCreate: typeof handleInboundCreateType;
let handleInboundQuote: typeof handleInboundQuoteType;
let handleInboundUpdate: typeof handleInboundUpdateType;
let resolveStoredInboundQuote: typeof resolveStoredInboundQuoteType;
let revokeInboundQuote: typeof revokeInboundQuoteType;
let localInstanceId: string;

before(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.PUBLIC_ORIGIN = publicOrigin;
  ({
    ActivityPubActors,
    ActivityPubPostQuotes,
    ActivityPubPosts,
    db,
    firstOrThrow,
    Instances,
    pg,
    PostContents,
    Posts,
    ProfileFollows,
    Profiles,
  } = await import('@kosmo/core/db'));
  const { seedDatabase } = (await import('@kosmo/core/db/seed')) as typeof CoreSeed;
  ({ createPost } = await import('@kosmo/core/services'));
  ({ createKosmoFederation } = await import('./federation'));
  ({ handleInboundCreate } = await import('./inbound-create'));
  ({ handleInboundQuote, resolveStoredInboundQuote, revokeInboundQuote } =
    await import('./inbound-quote'));
  ({ handleInboundUpdate } = await import('./inbound-update'));
  const { localInstance } = await seedDatabase({ publicOrigin });
  localInstanceId = localInstance.id;
});

beforeEach(async () => {
  mock.restoreAll();
  await db.delete(ActivityPubPostQuotes);
  await db.update(Posts).set({ currentContentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await db.delete(Instances).where(ne(Instances.id, localInstanceId));
});

after(async () => {
  await db.delete(ActivityPubPostQuotes);
  await db.update(Posts).set({ currentContentId: null, repostSourceId: null });
  await db.delete(PostContents);
  await db.delete(Posts);
  await db.delete(Profiles);
  await pg.end();
});

test('FEP-044f authorization approves one materialized Source without changing Note identity', async () => {
  const sourceActor = await createRemoteActor('source', 'https://source.example/users/source');
  const quoteActor = await createRemoteActor('quote', 'https://quote.example/users/quote');
  const source = await createRemotePost(sourceActor.id, 'https://source.example/notes/1');
  const quoteUri = new URL('https://quote.example/notes/2');
  const quoteNote = new Note({
    attribution: new URL('https://quote.example/users/quote'),
    content: 'quoted with consent',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new URL('https://source.example/notes/1'),
  });
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/source'),
    id: new URL('https://source.example/authorizations/1'),
    interactingObject: quoteNote,
    interactionTarget: new URL('https://source.example/notes/1'),
  });
  const noteWithAuthorization = quoteNote.clone({ quoteAuthorization: authorization });
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const authorizationDocument = await authorization.toJsonLd({ format: 'expand' });

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context: createContext(new Map([[authorization.id!.href, authorizationDocument]])),
    note: noteWithAuthorization,
    postId: quote.post.id,
    receivedAt,
  });

  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  const storedPost = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .then(firstOrThrow);

  assert.equal(storedQuote.targetUri, 'https://source.example/notes/1');
  assert.equal(storedQuote.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(storedQuote.approvalUri, 'https://source.example/authorizations/1');
  assert.equal(storedPost.repostSourceId, source.post.id);
  assert.equal(quoteUri.href, 'https://quote.example/notes/2');
});

test('Create listener materializes the Quote body first and then records its resolution state', async () => {
  const sourceActor = await createRemoteActor('source', 'https://source.example/users/source');
  await createRemoteActor('quote', 'https://quote.example/users/quote');
  const source = await createRemotePost(sourceActor.id, 'https://source.example/notes/listener');
  const quoteUri = new URL('https://quote.example/notes/listener-quote');
  const note = new Note({
    attribution: new URL('https://quote.example/users/quote'),
    content: 'listener quote',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new URL('https://source.example/notes/listener'),
  });

  await handleInboundCreate(
    createContext(),
    new Create({ actor: new URL('https://quote.example/users/quote'), object: note }),
    receivedAt,
  );

  const quoteMapping = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, quoteUri.href))
    .then(firstOrThrow);
  const quotePost = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quoteMapping.postId))
    .then(firstOrThrow);
  const quoteState = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quoteMapping.postId))
    .then(firstOrThrow);

  assert.equal(quotePost.repostSourceId, source.post.id);
  assert.equal(quoteState.status, ActivityPubQuoteStatus.PENDING);
});

test('a remote Quote without authorization remains pending and keeps its body visible', async () => {
  const sourceActor = await createRemoteActor('source', 'https://source.example/users/source');
  const quoteActor = await createRemoteActor('quote', 'https://quote.example/users/quote');
  const source = await createRemotePost(
    sourceActor.id,
    'https://source.example/notes/pending-source',
  );
  const quoteUri = new URL('https://quote.example/notes/pending-quote');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const note = new Note({
    attribution: new URL('https://quote.example/users/quote'),
    content: 'pending quote body',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new URL('https://source.example/notes/pending-source'),
  });

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context: createContext(),
    note,
    postId: quote.post.id,
    receivedAt,
  });

  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  const storedPost = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .then(firstOrThrow);

  assert.equal(storedQuote.status, ActivityPubQuoteStatus.PENDING);
  assert.equal(storedPost.repostSourceId, source.post.id);
  assert.ok(storedPost.currentContentId);
});

test('an embedded public target uses the existing remote Note materializer before resolution', async () => {
  await createRemoteActor('source', 'https://source.example/users/source');
  const quoteActor = await createRemoteActor('quote', 'https://quote.example/users/quote');
  const targetUri = new URL('https://source.example/notes/embedded');
  const quoteUri = new URL('https://quote.example/notes/with-embedded-target');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const note = new Note({
    attribution: new URL('https://quote.example/users/quote'),
    content: 'quote body',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new Note({
      attribution: new URL('https://source.example/users/source'),
      content: 'embedded source',
      id: targetUri,
      to: PUBLIC_COLLECTION,
    }),
  });

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context: createContext(),
    note,
    postId: quote.post.id,
    receivedAt,
  });

  const materialized = await db
    .select({ id: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, targetUri.href))
    .then(firstOrThrow);
  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);

  assert.ok(materialized.id);
  assert.equal(storedQuote.status, ActivityPubQuoteStatus.PENDING);
});

test('a URL-only public target is hydrated through Fedify before resolution', async () => {
  await createRemoteActor('source', 'https://source.example/users/source');
  const quoteActor = await createRemoteActor('quote', 'https://quote.example/users/quote');
  const targetUri = new URL('https://source.example/notes/url-only');
  const quoteUri = new URL('https://quote.example/notes/url-only-quote');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const targetNote = new Note({
    attribution: new URL('https://source.example/users/source'),
    content: 'hydrated source',
    id: targetUri,
    to: PUBLIC_COLLECTION,
  });

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context: createContext(new Map(), async (identifier) =>
      identifier.toString() === targetUri.href ? targetNote : null,
    ),
    note: new Note({
      attribution: new URL('https://quote.example/users/quote'),
      content: 'quote body',
      id: quoteUri,
      to: PUBLIC_COLLECTION,
      quote: targetUri,
    }),
    postId: quote.post.id,
    receivedAt,
  });

  const materialized = await db
    .select({ id: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, targetUri.href))
    .then(firstOrThrow);
  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);

  assert.ok(materialized.id);
  assert.equal(storedQuote.status, ActivityPubQuoteStatus.PENDING);
  assert.ok(
    (await db.select().from(Posts).where(eq(Posts.id, materialized.id)).then(firstOrThrow))
      .currentContentId,
  );
});

test('유효한 FEP Quote는 서로 다른 legacy URL보다 우선한다', async () => {
  const sourceActor = await createRemoteActor('source', 'https://source.example/users/source');
  const fepSource = await createRemotePost(
    sourceActor.id,
    'https://source.example/notes/fep-priority',
  );
  const legacySource = await createRemotePost(
    sourceActor.id,
    'https://source.example/notes/legacy',
  );
  const quoteUri = new URL('https://source.example/notes/fep-priority-quote');
  const quote = await createRemotePost(sourceActor.id, quoteUri.href);
  const note = new Note({
    attribution: new URL('https://source.example/users/source'),
    content: 'FEP takes priority',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new URL('https://source.example/notes/fep-priority'),
    quoteUrl: new URL('https://source.example/notes/legacy'),
  });

  await handleInboundQuote({
    actorUri: 'https://source.example/users/source',
    context: createContext(),
    note,
    postId: quote.post.id,
    receivedAt,
  });

  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);

  assert.equal(storedQuote.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(storedQuote.format, 'FEP_044F');
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    fepSource.post.id,
  );
  assert.notEqual(fepSource.post.id, legacySource.post.id);
});

test('legacy Quote는 Source 검증 뒤 승인서 없이 승인된다', async () => {
  const sourceActor = await createRemoteActor(
    'legacy-source',
    'https://source.example/users/legacy',
  );
  const quoteActor = await createRemoteActor('legacy-quote', 'https://quote.example/users/legacy');
  const source = await createRemotePost(
    sourceActor.id,
    'https://source.example/notes/legacy-approved',
  );
  const quote = await createRemotePost(
    quoteActor.id,
    'https://quote.example/notes/legacy-approved',
  );

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/legacy',
    context: createContext(),
    note: new Note({
      attribution: new URL('https://quote.example/users/legacy'),
      id: new URL('https://quote.example/notes/legacy-approved'),
      quoteUrl: new URL('https://source.example/notes/legacy-approved'),
      to: PUBLIC_COLLECTION,
    }),
    postId: quote.post.id,
    receivedAt,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );
});

test('malformed FEP가 있으면 legacy target을 조회하거나 materialize하지 않는다', async () => {
  await createRemoteActor('malformed-source', 'https://source.example/users/malformed');
  const quoteActor = await createRemoteActor(
    'malformed-quote',
    'https://quote.example/users/malformed',
  );
  const quote = await createRemotePost(quoteActor.id, 'https://quote.example/notes/malformed');
  const legacyUri = new URL('https://source.example/notes/must-not-fetch');
  const note = new Note({
    attribution: new URL('https://quote.example/users/malformed'),
    id: new URL('https://quote.example/notes/malformed'),
    quoteUrl: legacyUri,
    to: PUBLIC_COLLECTION,
  });
  mock.method(
    note,
    'toJsonLd',
    async () => [{ 'https://w3id.org/fep/044f#quote': [{ '@value': 'malformed' }] }] as never,
  );
  const lookupObject = mock.fn(
    async () =>
      new Note({
        attribution: new URL('https://source.example/users/malformed'),
        content: 'must not persist',
        id: legacyUri,
        to: PUBLIC_COLLECTION,
      }),
  );

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/malformed',
    context: createContext(new Map(), lookupObject),
    note,
    postId: quote.post.id,
    receivedAt,
  });

  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, legacyUri.href)), 0);
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow)
    ).status,
    ActivityPubQuoteStatus.INVALID,
  );
});

test('Quote resolution은 자기 Post를 Source로 저장하지 않는다', async () => {
  const actor = await createRemoteActor('self-source', 'https://quote.example/users/self-source');
  const uri = new URL('https://quote.example/notes/self-source');
  const quote = await createRemotePost(actor.id, uri.href);

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/self-source',
    context: createContext(),
    note: new Note({
      attribution: new URL('https://quote.example/users/self-source'),
      id: uri,
      quote: uri,
      to: PUBLIC_COLLECTION,
    }),
    postId: quote.post.id,
    receivedAt,
  });

  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow)
    ).status,
    ActivityPubQuoteStatus.INVALID,
  );
});

test('stale Workflow 결과는 concurrent 철회 revision과 Source 관계를 덮어쓰지 않는다', async () => {
  await createRemoteActor('race-source', 'https://source.example/users/race');
  const quoteActor = await createRemoteActor('race-quote', 'https://quote.example/users/race');
  const quote = await createRemotePost(quoteActor.id, 'https://quote.example/notes/race');
  const targetUri = new URL('https://source.example/notes/race');
  await db.insert(ActivityPubPostQuotes).values({
    format: 'FEP_044F',
    postId: quote.post.id,
    resolutionRevision: 1,
    status: ActivityPubQuoteStatus.PENDING,
    targetUri: targetUri.href,
  });
  const lookupObject = mock.fn(async () => {
    await db
      .update(ActivityPubPostQuotes)
      .set({ resolutionRevision: 2, status: ActivityPubQuoteStatus.REVOKED })
      .where(eq(ActivityPubPostQuotes.postId, quote.post.id));
    return new Note({
      attribution: new URL('https://source.example/users/race'),
      content: 'late source',
      id: targetUri,
      to: PUBLIC_COLLECTION,
    });
  });

  const result = await resolveStoredInboundQuote({
    context: createContext(new Map(), lookupObject),
    postId: quote.post.id,
    receivedAt,
    revision: 1,
  });
  const stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.REVOKED });
  assert.equal(stored.resolutionRevision, 2);
  assert.equal(stored.status, ActivityPubQuoteStatus.REVOKED);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, targetUri.href)), 0);
});

test('target lookup의 transient 오류만 retryable PENDING이고 영구 object 오류는 INVALID다', async () => {
  const quoteActor = await createRemoteActor(
    'failure-quote',
    'https://quote.example/users/failure',
  );
  const transient = await createRemotePost(quoteActor.id, 'https://quote.example/notes/transient');
  const permanent = await createRemotePost(quoteActor.id, 'https://quote.example/notes/permanent');
  const makeNote = (id: string, target: string) =>
    new Note({
      attribution: new URL('https://quote.example/users/failure'),
      id: new URL(id),
      quote: new URL(target),
      to: PUBLIC_COLLECTION,
    });

  const transientResult = await handleInboundQuote({
    actorUri: 'https://quote.example/users/failure',
    context: createContext(new Map(), async () => {
      throw new Error('temporary outage');
    }),
    note: makeNote(
      'https://quote.example/notes/transient',
      'https://source.example/notes/transient',
    ),
    postId: transient.post.id,
    receivedAt,
    startWorkflow: false,
  });
  const permanentLookup = mock.fn(
    async () => new Person({ id: new URL('https://source.example/users/not-note') }),
  );
  const permanentInput = {
    actorUri: 'https://quote.example/users/failure',
    context: createContext(new Map(), permanentLookup),
    note: makeNote(
      'https://quote.example/notes/permanent',
      'https://source.example/notes/permanent',
    ),
    postId: permanent.post.id,
    receivedAt,
    startWorkflow: false,
  } as const;
  const permanentResult = await handleInboundQuote(permanentInput);
  const repeatedPermanentResult = await handleInboundQuote(permanentInput);

  assert.deepEqual(transientResult, { retryable: true, status: ActivityPubQuoteStatus.PENDING });
  assert.deepEqual(permanentResult, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  assert.deepEqual(repeatedPermanentResult, permanentResult);
  assert.equal(permanentLookup.mock.calls.length, 1);
});

test('Source 작성자 discovery 장애는 transient PENDING으로 분류한다', async () => {
  const quoteActor = await createRemoteActor(
    'author-discovery-quote',
    'https://quote.example/users/author-discovery',
  );
  const quote = await createRemotePost(
    quoteActor.id,
    'https://quote.example/notes/author-discovery',
  );
  const targetUri = new URL('https://source.example/notes/author-discovery');
  const actorUri = new URL('https://source.example/users/author-discovery');
  const context = createContext(new Map(), async (identifier) => {
    if (identifier.toString() === actorUri.href) {
      throw new Error('temporary actor lookup outage');
    }
    return new Note({
      attribution: actorUri,
      content: 'temporarily unavailable author',
      id: targetUri,
      to: PUBLIC_COLLECTION,
    });
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/author-discovery',
    context,
    note: new Note({
      attribution: new URL('https://quote.example/users/author-discovery'),
      id: new URL('https://quote.example/notes/author-discovery'),
      quote: targetUri,
      to: PUBLIC_COLLECTION,
    }),
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: true, status: ActivityPubQuoteStatus.PENDING });
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow)
    ).status,
    ActivityPubQuoteStatus.PENDING,
  );
});

test('Workflow start 실패는 caller에 전파되어 동일 revision을 durable delivery가 재시도할 수 있다', async () => {
  const quoteActor = await createRemoteActor(
    'start-failure',
    'https://quote.example/users/start-failure',
  );
  const quote = await createRemotePost(quoteActor.id, 'https://quote.example/notes/start-failure');
  const note = new Note({
    attribution: new URL('https://quote.example/users/start-failure'),
    id: new URL('https://quote.example/notes/start-failure'),
    quote: new URL('https://source.example/notes/start-failure'),
    to: PUBLIC_COLLECTION,
  });
  let startAttempts = 0;
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    startAttempts += 1;
    if (startAttempts === 1) {
      throw new Error('Temporal unavailable');
    }
    return {} as never;
  });

  await assert.rejects(
    handleInboundQuote({
      actorUri: 'https://quote.example/users/start-failure',
      context: createContext(new Map(), async () => {
        throw new Error('temporary outage');
      }),
      note,
      postId: quote.post.id,
      receivedAt,
    }),
    /Temporal unavailable/,
  );
  await handleInboundQuote({
    actorUri: 'https://quote.example/users/start-failure',
    context: createContext(new Map(), async () => {
      throw new Error('temporary outage');
    }),
    note,
    postId: quote.post.id,
    receivedAt,
  });
  const stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.PENDING);
  assert.equal(stored.resolutionRevision, 1);
  assert.equal(start.mock.calls.length, 2);
  for (const call of start.mock.calls) {
    assert.equal(call.arguments[1]?.workflowId, `activitypub-quote-resolution:${quote.post.id}:1`);
  }
});

test('source-author revocation preserves Source relation and a late approval cannot restore it', async () => {
  const sourceActor = await createRemoteActor('source', 'https://source.example/users/source');
  const quoteActor = await createRemoteActor('quote', 'https://quote.example/users/quote');
  const source = await createRemotePost(sourceActor.id, 'https://source.example/notes/revoked');
  const quoteUri = new URL('https://quote.example/notes/revoked-quote');
  const quoteNote = new Note({
    attribution: new URL('https://quote.example/users/quote'),
    content: 'revocable quote',
    id: quoteUri,
    to: PUBLIC_COLLECTION,
    quote: new URL('https://source.example/notes/revoked'),
  });
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/source'),
    id: new URL('https://source.example/authorizations/revoked'),
    interactingObject: quoteNote,
    interactionTarget: new URL('https://source.example/notes/revoked'),
  });
  const noteWithAuthorization = quoteNote.clone({ quoteAuthorization: authorization });
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const authorizationDocument = await authorization.toJsonLd({ format: 'expand' });
  const context = createContext(new Map([[authorization.id!.href, authorizationDocument]]));

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context,
    note: noteWithAuthorization,
    postId: quote.post.id,
    receivedAt,
  });
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );

  assert.equal(
    await revokeInboundQuote({
      actorUri: 'https://source.example/users/source',
      authorizationUri: authorization.id!.href,
    }),
    true,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/quote',
    context,
    note: noteWithAuthorization,
    postId: quote.post.id,
    receivedAt,
  });
  const storedQuote = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(storedQuote.status, ActivityPubQuoteStatus.REVOKED);
});

test('Update authorization add/remove와 Delete listener가 revision 및 철회 계약을 지킨다', async () => {
  const sourceActor = await createRemoteActor(
    'lifecycle-source',
    'https://source.example/users/lifecycle',
  );
  const quoteActor = await createRemoteActor(
    'lifecycle-quote',
    'https://quote.example/users/lifecycle',
  );
  const source = await createRemotePost(sourceActor.id, 'https://source.example/notes/lifecycle');
  const quoteUri = new URL('https://quote.example/notes/lifecycle');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const base = new Note({
    attribution: new URL('https://quote.example/users/lifecycle'),
    content: 'lifecycle body',
    id: quoteUri,
    quote: new URL('https://source.example/notes/lifecycle'),
    to: PUBLIC_COLLECTION,
  });
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/lifecycle'),
    id: new URL('https://source.example/authorizations/lifecycle'),
    interactingObject: base,
    interactionTarget: new URL('https://source.example/notes/lifecycle'),
  });
  const approved = base.clone({ quoteAuthorization: authorization });
  const replacementAuthorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/lifecycle'),
    id: new URL('https://source.example/authorizations/lifecycle-replacement'),
    interactingObject: base,
    interactionTarget: new URL('https://source.example/notes/lifecycle'),
  });
  const replacementApproved = base.clone({ quoteAuthorization: replacementAuthorization });
  const authorizationDocument = await authorization.toJsonLd({ format: 'expand' });
  const replacementAuthorizationDocument = await replacementAuthorization.toJsonLd({
    format: 'expand',
  });
  const context = createContext(
    new Map([
      [authorization.id!.href, authorizationDocument],
      [replacementAuthorization.id!.href, replacementAuthorizationDocument],
    ]),
  );
  const sourceKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const quoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const sourceKeyUri = new URL('#main-key', 'https://source.example/users/lifecycle');
  const quoteKeyUri = new URL('#main-key', 'https://quote.example/users/lifecycle');
  const sourceKey = new CryptographicKey({
    id: sourceKeyUri,
    owner: new URL('https://source.example/users/lifecycle'),
    publicKey: sourceKeyPair.publicKey,
  });
  const quoteKey = new CryptographicKey({
    id: quoteKeyUri,
    owner: new URL('https://quote.example/users/lifecycle'),
    publicKey: quoteKeyPair.publicKey,
  });
  const sourcePerson = new Person({
    id: new URL('https://source.example/users/lifecycle'),
    publicKey: sourceKey,
  });
  const quotePerson = new Person({
    id: new URL('https://quote.example/users/lifecycle'),
    publicKey: quoteKey,
  });
  const documents = new Map<string, unknown>([
    [sourcePerson.id!.href, await sourcePerson.toJsonLd({ format: 'expand' })],
    [sourceKeyUri.href, await sourceKey.toJsonLd({ format: 'expand' })],
    [quotePerson.id!.href, await quotePerson.toJsonLd({ format: 'expand' })],
    [quoteKeyUri.href, await quoteKey.toJsonLd({ format: 'expand' })],
    [authorization.id!.href, authorizationDocument],
    [replacementAuthorization.id!.href, replacementAuthorizationDocument],
  ]);
  const documentLoader = async (url: string) => {
    const document = documents.get(url);
    if (!document) {
      throw new Error(`unexpected production listener document URL: ${url}`);
    }
    return { contextUrl: null, document, documentUrl: url };
  };
  const productionFederation = createKosmoFederation({
    authenticatedDocumentLoaderFactory: () => documentLoader,
    contextLoaderFactory: () => getDocumentLoader(),
    documentLoaderFactory: () => documentLoader,
  });
  const deliver = async (activity: Update | Delete, privateKey: CryptoKey, keyUri: URL) => {
    const request = new Request(new URL('/inbox', publicOrigin), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader: getDocumentLoader() })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });
    const response = await productionFederation.fetch(
      await signRequest(request, privateKey, keyUri),
      { contextData: undefined },
    );
    assert.equal(response.status, 202, await response.text());
  };

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/lifecycle',
    context,
    note: base,
    postId: quote.post.id,
    receivedAt,
  });
  for (const object of [
    base.clone({ quote: null, quoteUrl: base.quoteId }),
    base.clone({ quote: new URL('https://source.example/notes/another-target') }),
  ]) {
    await deliver(
      new Update({ actor: quotePerson.id!, object }),
      quoteKeyPair.privateKey,
      quoteKeyUri,
    );
    const unchanged = await db
      .select()
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
      .then(firstOrThrow);
    assert.equal(unchanged.status, ActivityPubQuoteStatus.PENDING);
    assert.equal(unchanged.format, 'FEP_044F');
    assert.equal(unchanged.targetUri, base.quoteId!.href);
    assert.equal(unchanged.approvalUri, null);
    assert.equal(unchanged.resolutionRevision, 1);
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
        .repostSourceId,
      source.post.id,
    );
  }
  await Promise.all(
    [0, 1].map(() =>
      deliver(
        new Update({ actor: quotePerson.id!, object: approved }),
        quoteKeyPair.privateKey,
        quoteKeyUri,
      ),
    ),
  );
  await deliver(
    new Update({ actor: quotePerson.id!, object: approved }),
    quoteKeyPair.privateKey,
    quoteKeyUri,
  );
  let stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.resolutionRevision, 2);

  await deliver(
    new Update({ actor: quotePerson.id!, object: replacementApproved }),
    quoteKeyPair.privateKey,
    quoteKeyUri,
  );
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.approvalUri, replacementAuthorization.id!.href);
  assert.equal(stored.resolutionRevision, 3);

  await deliver(
    new Update({ actor: quotePerson.id!, object: base }),
    quoteKeyPair.privateKey,
    quoteKeyUri,
  );
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.PENDING);
  assert.equal(stored.resolutionRevision, 4);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );

  await deliver(
    new Update({ actor: quotePerson.id!, object: approved }),
    quoteKeyPair.privateKey,
    quoteKeyUri,
  );
  await deliver(
    new Delete({ actor: quotePerson.id!, object: authorization.id! }),
    quoteKeyPair.privateKey,
    quoteKeyUri,
  );
  await deliver(
    new Delete({
      actor: sourcePerson.id!,
      object: new URL('https://source.example/authorizations/wrong'),
    }),
    sourceKeyPair.privateKey,
    sourceKeyUri,
  );
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow)
    ).status,
    ActivityPubQuoteStatus.APPROVED,
  );

  const deletion = new Delete({ actor: sourcePerson.id!, object: authorization.id! });
  await deliver(deletion, sourceKeyPair.privateKey, sourceKeyUri);
  await deliver(deletion, sourceKeyPair.privateKey, sourceKeyUri);
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.REVOKED);
  assert.equal(stored.resolutionRevision, 6);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );
});

for (const change of [
  'target',
  'missing-target',
  'quoteUrl',
  'quoteUri',
  '_misskey_quote',
] as const) {
  test(`embedded Update의 ${change} 변경은 기존 FEP target/format/status를 보존한다`, async () => {
    const sourceActor = await createRemoteActor(
      'immutable-source',
      'https://source.example/users/immutable',
    );
    const quoteActor = await createRemoteActor(
      'immutable-quote',
      'https://quote.example/users/immutable',
    );
    const target = new URL('https://source.example/notes/immutable-a');
    const source = await createRemotePost(sourceActor.id, target.href);
    const quote = await createRemotePost(quoteActor.id, 'https://quote.example/notes/immutable');
    const base = new Note({
      attribution: new URL('https://quote.example/users/immutable'),
      id: new URL('https://quote.example/notes/immutable'),
      quote: target,
      to: PUBLIC_COLLECTION,
    });
    const lookupObject = mock.fn(async () => null);
    const context = createContext(new Map(), lookupObject);
    await handleInboundQuote({
      actorUri: base.attributionId!.href,
      context,
      note: base,
      postId: quote.post.id,
      receivedAt,
    });
    const before = await db
      .select()
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
      .then(firstOrThrow);
    assert.equal(before.status, ActivityPubQuoteStatus.PENDING);
    const aliases = {
      quoteUrl: 'https://www.w3.org/ns/activitystreams#quoteUrl',
      quoteUri: 'http://fedibird.com/ns#quoteUri',
      _misskey_quote: 'https://misskey-hub.net/ns#_misskey_quote',
    };
    if (change === 'target') {
      await createRemotePost(sourceActor.id, 'https://source.example/notes/immutable-b');
    }
    const changesTarget = change === 'target' || change === 'missing-target';
    const changed = changesTarget
      ? base.clone({ quote: new URL('https://source.example/notes/immutable-b') })
      : await Note.fromJsonLd(
          {
            '@context': [
              'https://www.w3.org/ns/activitystreams',
              {
                [change]: {
                  '@id': aliases[change],
                  '@type': 'http://www.w3.org/2001/XMLSchema#anyURI',
                },
              },
            ],
            type: 'Note',
            id: base.id!.href,
            attributedTo: base.attributionId!.href,
            [change]: target.href,
          },
          { contextLoader: getDocumentLoader() },
        );
    if (!changesTarget) {
      assert.equal(changed.quoteUrl?.href, target.href);
    }
    const update = new Update({ actor: base.attributionId!, object: changed });
    await Promise.all([
      handleInboundUpdate(context, update, receivedAt),
      handleInboundUpdate(context, update, receivedAt),
    ]);
    await handleInboundUpdate(context, update, receivedAt);
    assert.deepEqual(
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow),
      before,
    );
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
        .repostSourceId,
      source.post.id,
    );
    assert.equal(lookupObject.mock.calls.length, 0);
  });
}

test('Quote metadata가 없는 기존 Post는 embedded Update로 backfill하지 않는다', async () => {
  const actor = await createRemoteActor('no-backfill', 'https://quote.example/users/no-backfill');
  const source = await createRemotePost(actor.id, 'https://quote.example/notes/no-backfill-source');
  const quote = await createRemotePost(actor.id, 'https://quote.example/notes/no-backfill');
  await db.update(Posts).set({ repostSourceId: source.post.id }).where(eq(Posts.id, quote.post.id));
  await handleInboundUpdate(
    createContext(),
    new Update({
      actor: new URL('https://quote.example/users/no-backfill'),
      object: new Note({
        attribution: new URL('https://quote.example/users/no-backfill'),
        id: new URL('https://quote.example/notes/no-backfill'),
        quoteUrl: new URL('https://quote.example/notes/no-backfill-source'),
      }),
    }),
    receivedAt,
  );
  assert.equal(
    await db.$count(ActivityPubPostQuotes, eq(ActivityPubPostQuotes.postId, quote.post.id)),
    0,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );
});

test('IRI-only 및 authorization-only Update는 Quote 상태를 변경하지 않는다', async () => {
  const sourceActor = await createRemoteActor(
    'out-of-scope-source',
    'https://source.example/users/out-of-scope',
  );
  const quoteActor = await createRemoteActor(
    'out-of-scope-quote',
    'https://quote.example/users/out-of-scope',
  );
  await createRemotePost(sourceActor.id, 'https://source.example/notes/out-of-scope');
  const quoteUri = new URL('https://quote.example/notes/out-of-scope');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const note = new Note({
    attribution: new URL('https://quote.example/users/out-of-scope'),
    id: quoteUri,
    quote: new URL('https://source.example/notes/out-of-scope'),
    to: PUBLIC_COLLECTION,
  });
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/out-of-scope'),
    id: new URL('https://source.example/authorizations/out-of-scope'),
    interactingObject: note,
    interactionTarget: new URL('https://source.example/notes/out-of-scope'),
  });
  const context = createContext();

  await handleInboundQuote({
    actorUri: 'https://quote.example/users/out-of-scope',
    context,
    note,
    postId: quote.post.id,
    receivedAt,
  });
  const before = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);

  await handleInboundUpdate(
    context,
    new Update({
      actor: new URL('https://quote.example/users/out-of-scope'),
      object: quoteUri,
    }),
    receivedAt,
  );
  await handleInboundUpdate(
    context,
    new Update({
      actor: new URL('https://quote.example/users/out-of-scope'),
      object: authorization,
    }),
    receivedAt,
  );

  const after = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.deepEqual(after, before);
});

test('self-quote와 legacy Update는 승인 참조 revision만 바꾸고 APPROVED를 유지한다', async () => {
  const selfActor = await createRemoteActor(
    'update-self',
    'https://quote.example/users/update-self',
  );
  const selfSource = await createRemotePost(
    selfActor.id,
    'https://quote.example/notes/update-self-source',
  );
  const selfQuote = await createRemotePost(
    selfActor.id,
    'https://quote.example/notes/update-self-quote',
  );
  const selfBase = new Note({
    attribution: new URL('https://quote.example/users/update-self'),
    id: new URL('https://quote.example/notes/update-self-quote'),
    quote: new URL('https://quote.example/notes/update-self-source'),
    to: PUBLIC_COLLECTION,
  });
  const selfAuthorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://quote.example/users/update-self'),
    id: new URL('https://quote.example/authorizations/update-self'),
    interactingObject: selfBase,
    interactionTarget: new URL('https://quote.example/notes/update-self-source'),
  });
  const selfContext = createContext();
  await handleInboundQuote({
    actorUri: 'https://quote.example/users/update-self',
    context: selfContext,
    note: selfBase,
    postId: selfQuote.post.id,
    receivedAt,
  });
  const selfBefore = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, selfQuote.post.id))
    .then(firstOrThrow);
  await createRemotePost(selfActor.id, 'https://quote.example/notes/update-self-other');
  await handleInboundUpdate(
    selfContext,
    new Update({
      actor: selfBase.attributionId!,
      object: selfBase.clone({ quote: new URL('https://quote.example/notes/update-self-other') }),
    }),
    receivedAt,
  );
  assert.deepEqual(
    await db
      .select()
      .from(ActivityPubPostQuotes)
      .where(eq(ActivityPubPostQuotes.postId, selfQuote.post.id))
      .then(firstOrThrow),
    selfBefore,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, selfQuote.post.id)).then(firstOrThrow))
      .repostSourceId,
    selfSource.post.id,
  );
  await handleInboundUpdate(
    selfContext,
    new Update({
      actor: new URL('https://quote.example/users/update-self'),
      object: selfBase.clone({ quoteAuthorization: selfAuthorization }),
    }),
    receivedAt,
  );
  let stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, selfQuote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.approvalUri, selfAuthorization.id!.href);
  assert.equal(stored.resolutionRevision, 2);
  await handleInboundUpdate(
    selfContext,
    new Update({ actor: new URL('https://quote.example/users/update-self'), object: selfBase }),
    receivedAt,
  );
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, selfQuote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.approvalUri, null);
  assert.equal(stored.resolutionRevision, 3);

  const legacySourceActor = await createRemoteActor(
    'update-legacy-source',
    'https://legacy-source.example/users/update-legacy',
  );
  const legacyQuoteActor = await createRemoteActor(
    'update-legacy-quote',
    'https://legacy-quote.example/users/update-legacy',
  );
  await createRemotePost(legacySourceActor.id, 'https://legacy-source.example/notes/update-legacy');
  const legacyQuote = await createRemotePost(
    legacyQuoteActor.id,
    'https://legacy-quote.example/notes/update-legacy',
  );
  const legacyBase = new Note({
    attribution: new URL('https://legacy-quote.example/users/update-legacy'),
    id: new URL('https://legacy-quote.example/notes/update-legacy'),
    quoteUrl: new URL('https://legacy-source.example/notes/update-legacy'),
    to: PUBLIC_COLLECTION,
  });
  const legacyAuthorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://legacy-source.example/users/update-legacy'),
    id: new URL('https://legacy-source.example/authorizations/update-legacy'),
    interactingObject: legacyBase,
    interactionTarget: new URL('https://legacy-source.example/notes/update-legacy'),
  });
  const legacyContext = createContext();
  await handleInboundQuote({
    actorUri: 'https://legacy-quote.example/users/update-legacy',
    context: legacyContext,
    note: legacyBase,
    postId: legacyQuote.post.id,
    receivedAt,
  });
  await handleInboundUpdate(
    legacyContext,
    new Update({
      actor: new URL('https://legacy-quote.example/users/update-legacy'),
      object: legacyBase.clone({ quoteAuthorization: legacyAuthorization }),
    }),
    receivedAt,
  );
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, legacyQuote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.approvalUri, legacyAuthorization.id!.href);
  assert.equal(stored.resolutionRevision, 2);
  await handleInboundUpdate(
    legacyContext,
    new Update({
      actor: new URL('https://legacy-quote.example/users/update-legacy'),
      object: legacyBase,
    }),
    receivedAt,
  );
  stored = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, legacyQuote.post.id))
    .then(firstOrThrow);
  assert.equal(stored.status, ActivityPubQuoteStatus.APPROVED);
  assert.equal(stored.approvalUri, null);
  assert.equal(stored.resolutionRevision, 3);
});

test('FEP self-quote는 승인서 없이 승인하되 다른 Post만 Source로 연결한다', async () => {
  const actor = await createRemoteActor('self-quote', 'https://quote.example/users/self-quote');
  const source = await createRemotePost(actor.id, 'https://quote.example/notes/self-quote-source');
  const quote = await createRemotePost(actor.id, 'https://quote.example/notes/self-quote');
  await handleInboundQuote({
    actorUri: 'https://quote.example/users/self-quote',
    context: createContext(),
    note: new Note({
      attribution: new URL('https://quote.example/users/self-quote'),
      id: new URL('https://quote.example/notes/self-quote'),
      quote: new URL('https://quote.example/notes/self-quote-source'),
      to: PUBLIC_COLLECTION,
    }),
    postId: quote.post.id,
    receivedAt,
  });
  assert.equal(
    (
      await db
        .select()
        .from(ActivityPubPostQuotes)
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
        .then(firstOrThrow)
    ).status,
    ActivityPubQuoteStatus.APPROVED,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );
});

test('검증된 Followers Only Source는 결정적인 Local Follower identity로 signed fetch한다', async () => {
  const sourceActor = await createRemoteActor(
    'private-source',
    'https://source.example/users/private-source',
  );
  const sourceFollowersUri = 'https://source.example/users/private-source/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));

  const firstFollower = await createLocalProfile('private-first');
  const secondFollower = await createLocalProfile('private-second');
  await db.insert(ProfileFollows).values([
    { followerProfileId: firstFollower.id, followeeProfileId: sourceActor.id },
    { followerProfileId: secondFollower.id, followeeProfileId: sourceActor.id },
  ]);
  const quoteActor = await createRemoteActor(
    'private-quote',
    'https://quote.example/users/private-quote',
  );
  const quoteUri = new URL('https://quote.example/notes/private-quote');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const sourceUri = new URL('https://source.example/notes/private-source');
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-source'),
    content: 'private source body',
    cc: new URL('https://mention.example/users/extra'),
    id: sourceUri,
    to: new URL(sourceFollowersUri),
  });
  const firstKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const secondKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [
      firstFollower.id,
      { ...firstKeyPair, keyId: new URL(`https://local.example/keys/${firstFollower.id}`) },
    ],
    [
      secondFollower.id,
      { ...secondKeyPair, keyId: new URL(`https://local.example/keys/${secondFollower.id}`) },
    ],
  ]);
  const selectedFollower = [firstFollower.id, secondFollower.id].sort()[0]!;
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const signedLoaderUrls: string[] = [];
  const lookupObject = mock.fn(async (identifier: string | URL, options?: unknown) => {
    assert.equal(identifier.toString(), sourceUri.href);
    const loader = (options as { documentLoader?: (url: string) => Promise<unknown> } | undefined)
      ?.documentLoader;
    assert.ok(loader);
    await loader(identifier.toString());
    return sourceNote;
  });
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-quote'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-source',
    sourceUri,
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-quote',
    context: createSignedContext(
      keyPairs,
      keyCalls,
      signedKeyIds,
      lookupObject,
      authorized.documents,
      signedLoaderUrls,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  assert.deepEqual(keyCalls, [selectedFollower]);
  assert.deepEqual(signedKeyIds, [`https://local.example/keys/${selectedFollower}`]);
  assert.deepEqual(signedLoaderUrls, [sourceUri.href]);
  assert.equal(lookupObject.mock.calls.length, 1);
  const lookupOptions = lookupObject.mock.calls[0]?.arguments[1] as
    | { documentLoader?: unknown }
    | undefined;
  assert.ok(lookupOptions?.documentLoader);
  const sourcePost = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href))
    .then(firstOrThrow);
  const storedSource = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, sourcePost.postId))
    .then(firstOrThrow);
  const storedQuote = await db
    .select()
    .from(Posts)
    .where(eq(Posts.id, quote.post.id))
    .then(firstOrThrow);
  assert.equal(storedSource.profileId, sourceActor.id);
  assert.equal(storedSource.visibility, PostVisibility.FOLLOWERS);
  assert.equal(storedQuote.repostSourceId, sourcePost.postId);
});

test('검증된 QuoteAuthorization의 Source 작성자가 production 경로의 signed fetch로 전달된다', async () => {
  const sourceActor = await createRemoteActor(
    'private-production-source',
    'https://source.example/users/private-production',
  );
  const sourceFollowersUri = 'https://source.example/users/private-production/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-production-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-production-quote',
    'https://quote.example/users/private-production',
  );
  const quoteUri = new URL('https://quote.example/notes/private-production');
  const sourceUri = new URL('https://source.example/notes/private-production');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const quoteNote = new Note({
    attribution: new URL('https://quote.example/users/private-production'),
    id: quoteUri,
    quote: sourceUri,
    to: PUBLIC_COLLECTION,
  });
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL('https://source.example/users/private-production'),
    id: new URL('https://source.example/authorizations/private-production'),
    interactingObject: quoteNote,
    interactionTarget: sourceUri,
  });
  const authorizationDocument = await authorization.toJsonLd({ format: 'expand' });
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-production'),
    content: 'private production source',
    id: sourceUri,
    to: new URL(sourceFollowersUri),
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
  ]);
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const signedLoaderUrls: string[] = [];
  const lookupObject = mock.fn(async (identifier: string | URL, options?: unknown) => {
    const loader = (options as { documentLoader?: (url: string) => Promise<unknown> } | undefined)
      ?.documentLoader;
    assert.ok(loader);
    await loader(identifier.toString());
    return sourceNote;
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-production',
    context: createSignedContext(
      keyPairs,
      keyCalls,
      signedKeyIds,
      lookupObject,
      new Map([[authorization.id!.href, authorizationDocument]]),
      signedLoaderUrls,
    ),
    note: quoteNote.clone({ quoteAuthorization: authorization.id! }),
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  assert.deepEqual(keyCalls, [follower.id]);
  assert.deepEqual(signedKeyIds, [`https://local.example/keys/${follower.id}`]);
  assert.deepEqual(signedLoaderUrls, [sourceUri.href]);
  assert.equal(lookupObject.mock.calls.length, 1);
  const sourcePost = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href))
    .then(firstOrThrow);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    sourcePost.postId,
  );
});

test('검증된 QuoteAuthorization의 Public Source는 일반 hydration 경로로 materialize된다', async () => {
  const sourceActor = await createRemoteActor(
    'authorized-public-source',
    'https://source.example/users/authorized-public',
  );
  const quoteActor = await createRemoteActor(
    'authorized-public-quote',
    'https://quote.example/users/authorized-public',
  );
  const sourceUri = new URL('https://source.example/notes/authorized-public');
  const quoteUri = new URL('https://quote.example/notes/authorized-public');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/authorized-public'),
    content: 'authorized public source',
    id: sourceUri,
    to: PUBLIC_COLLECTION,
  });
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/authorized-public'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/authorized-public',
    sourceUri,
  });
  authorized.documents.set(sourceUri.href, await sourceNote.toJsonLd({ format: 'expand' }));
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const lookupObject = mock.fn(async () => {
    throw new Error('Public Source must not require signed fallback lookup');
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/authorized-public',
    context: createSignedContext(
      new Map(),
      keyCalls,
      signedKeyIds,
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  assert.deepEqual(keyCalls, []);
  assert.deepEqual(signedKeyIds, []);
  assert.equal(lookupObject.mock.calls.length, 0);
  const source = await db
    .select({ postId: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href))
    .then(firstOrThrow);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.postId,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, source.postId)).then(firstOrThrow)).profileId,
    sourceActor.id,
  );
});

test('private Source URI 경쟁을 다른 작성자가 선점하면 Quote는 그 Post를 연결하지 않는다', async () => {
  const expectedActor = await createRemoteActor(
    'private-collision-expected',
    'https://source.example/users/private-collision-expected',
  );
  const wrongActor = await createRemoteActor(
    'private-collision-wrong',
    'https://wrong.example/users/private-collision-wrong',
  );
  const followersUri = 'https://source.example/users/private-collision-expected/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri })
    .where(eq(ActivityPubActors.profileId, expectedActor.id));
  const follower = await createLocalProfile('private-collision-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: expectedActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-collision-quote',
    'https://quote.example/users/private-collision',
  );
  const sourceUri = new URL('https://source.example/notes/private-collision');
  const quoteUri = new URL('https://quote.example/notes/private-collision');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-collision'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-collision-expected',
    sourceUri,
  });
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-collision-expected'),
    content: 'expected private source',
    id: sourceUri,
    to: new URL(followersUri),
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const lookupObject = mock.fn(async () => {
    await createRemotePost(wrongActor.id, sourceUri.href);
    return sourceNote;
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-collision',
    context: createSignedContext(
      new Map([
        [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
      ]),
      [],
      [],
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  const collision = await db
    .select({ postId: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href))
    .then(firstOrThrow);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, collision.postId)).then(firstOrThrow))
      .profileId,
    wrongActor.id,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
});

test('private Source URI 경쟁을 같은 작성자의 Public Post가 선점하면 Quote는 그 Post를 연결하지 않는다', async () => {
  const sourceActor = await createRemoteActor(
    'private-visibility-collision-source',
    'https://source.example/users/private-visibility-collision',
  );
  const followersUri = 'https://source.example/users/private-visibility-collision/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-visibility-collision-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-visibility-collision-quote',
    'https://quote.example/users/private-visibility-collision',
  );
  const sourceUri = new URL('https://source.example/notes/private-visibility-collision');
  const quoteUri = new URL('https://quote.example/notes/private-visibility-collision');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-visibility-collision'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-visibility-collision',
    sourceUri,
  });
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-visibility-collision'),
    content: 'expected private source',
    id: sourceUri,
    to: new URL(followersUri),
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const lookupObject = mock.fn(async () => {
    await createRemotePost(sourceActor.id, sourceUri.href);
    return sourceNote;
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-visibility-collision',
    context: createSignedContext(
      new Map([
        [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
      ]),
      [],
      [],
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  const collision = await db
    .select({ postId: ActivityPubPosts.postId })
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href))
    .then(firstOrThrow);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, collision.postId)).then(firstOrThrow))
      .visibility,
    PostVisibility.PUBLIC,
  );
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
});

test('동일 PENDING revision 재시도는 기존 Source를 연결하고 revision을 유지한다', async () => {
  const sourceActor = await createRemoteActor(
    'pending-retry-source',
    'https://source.example/users/pending-retry',
  );
  const quoteActor = await createRemoteActor(
    'pending-retry-quote',
    'https://quote.example/users/pending-retry',
  );
  const sourceUri = 'https://source.example/notes/pending-retry';
  const quoteUri = 'https://quote.example/notes/pending-retry';
  const source = await createRemotePost(sourceActor.id, sourceUri);
  const quote = await createRemotePost(quoteActor.id, quoteUri);
  const approvalUri = 'https://source.example/authorizations/pending-retry';
  await db.insert(ActivityPubPostQuotes).values({
    approvalUri,
    format: ActivityPubQuoteFormat.FEP_044F,
    postId: quote.post.id,
    resolutionRevision: 1,
    status: ActivityPubQuoteStatus.PENDING,
    targetUri: sourceUri,
  });

  const result = await resolveStoredInboundQuote({
    context: createContext(),
    postId: quote.post.id,
    receivedAt,
    revision: 1,
  });

  assert.deepEqual(result, { retryable: true, status: ActivityPubQuoteStatus.PENDING });
  const storedResolution = await db
    .select()
    .from(ActivityPubPostQuotes)
    .where(eq(ActivityPubPostQuotes.postId, quote.post.id))
    .then(firstOrThrow);
  assert.equal(storedResolution.resolutionRevision, 1);
  assert.equal(storedResolution.status, ActivityPubQuoteStatus.PENDING);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    source.post.id,
  );
});

test('trusted author가 저장되지 않았거나 eligible Local Follower가 없으면 Source fetch와 저장을 하지 않는다', async () => {
  const sourceActor = await createRemoteActor(
    'private-unavailable-source',
    'https://source.example/users/private-unavailable',
  );
  const sourceUri = new URL('https://source.example/notes/private-unavailable');
  await db
    .update(ActivityPubActors)
    .set({ followersUri: 'https://source.example/users/private-unavailable/followers' })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const quoteActor = await createRemoteActor(
    'private-unavailable-quote',
    'https://quote.example/users/private-unavailable',
  );
  const quoteUri = new URL('https://quote.example/notes/private-unavailable');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const lookupObject = mock.fn(async () => {
    throw new Error('Source must not be fetched without a candidate');
  });
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-unavailable'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-unavailable',
    sourceUri,
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-unavailable',
    context: createSignedContext(
      new Map(),
      keyCalls,
      signedKeyIds,
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  assert.deepEqual(keyCalls, []);
  assert.deepEqual(signedKeyIds, []);
  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)), 0);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
});

test('선택된 Local Follower에 signing key가 없으면 일반 loader로 fallback하지 않는다', async () => {
  const sourceActor = await createRemoteActor(
    'private-no-key-source',
    'https://source.example/users/private-no-key',
  );
  const sourceUri = new URL('https://source.example/notes/private-no-key');
  await db
    .update(ActivityPubActors)
    .set({ followersUri: 'https://source.example/users/private-no-key/followers' })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-no-key-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-no-key-quote',
    'https://quote.example/users/private-no-key',
  );
  const quoteUri = new URL('https://quote.example/notes/private-no-key');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const lookupObject = mock.fn(async () => {
    throw new Error('Source must not be fetched without a signing key');
  });
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-no-key'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-no-key',
    sourceUri,
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-no-key',
    context: createSignedContext(
      new Map(),
      keyCalls,
      signedKeyIds,
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  assert.deepEqual(keyCalls, [follower.id]);
  assert.deepEqual(signedKeyIds, []);
  assert.equal(lookupObject.mock.calls.length, 0);
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)), 0);
});

test('Followers Only Source fetch 중 Follow가 해제되면 저장 직전 재검증이 전체 저장을 거부한다', async () => {
  const sourceActor = await createRemoteActor(
    'private-revoked-source',
    'https://source.example/users/private-revoked',
  );
  const sourceFollowersUri = 'https://source.example/users/private-revoked/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-revoked-follower');
  const follow = await db
    .insert(ProfileFollows)
    .values({ followerProfileId: follower.id, followeeProfileId: sourceActor.id })
    .returning()
    .then(firstOrThrow);
  const quoteActor = await createRemoteActor(
    'private-revoked-quote',
    'https://quote.example/users/private-revoked',
  );
  const sourceUri = new URL('https://source.example/notes/private-revoked');
  const quote = await createRemotePost(
    quoteActor.id,
    'https://quote.example/notes/private-revoked',
  );
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
  ]);
  const lookupObject = mock.fn(async () => {
    await db.delete(ProfileFollows).where(eq(ProfileFollows.id, follow.id));
    return new Note({
      attribution: new URL('https://source.example/users/private-revoked'),
      content: 'must not be saved after follow revocation',
      id: sourceUri,
      to: new URL(sourceFollowersUri),
    });
  });
  const keyCalls: string[] = [];
  const signedKeyIds: string[] = [];
  const quoteNote = new Note({
    attribution: new URL('https://quote.example/users/private-revoked'),
    id: new URL('https://quote.example/notes/private-revoked'),
    quote: sourceUri,
    to: PUBLIC_COLLECTION,
  });
  const authorized = await authorizeQuoteSource({
    note: quoteNote,
    sourceAuthorUri: 'https://source.example/users/private-revoked',
    sourceUri,
  });

  const result = await handleInboundQuote({
    actorUri: 'https://quote.example/users/private-revoked',
    context: createSignedContext(
      keyPairs,
      keyCalls,
      signedKeyIds,
      lookupObject,
      authorized.documents,
    ),
    note: authorized.note,
    postId: quote.post.id,
    receivedAt,
    startWorkflow: false,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.INVALID });
  assert.deepEqual(keyCalls, [follower.id]);
  assert.equal(lookupObject.mock.calls.length, 1);
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)), 0);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
});

test('private admission은 Source Note의 exact author와 canonical Followers audience를 모두 검증한다', async () => {
  const sourceActor = await createRemoteActor(
    'private-validation-source',
    'https://source.example/users/private-validation',
  );
  const sourceFollowersUri = 'https://source.example/users/private-validation/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-validation-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-validation-quote',
    'https://quote.example/users/private-validation',
  );
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
  ]);
  const cases = [
    {
      expectedStatus: ActivityPubQuoteStatus.INVALID,
      name: 'wrong-author',
      note: (id: URL, followersUri: string) =>
        new Note({
          attribution: new URL('https://source.example/users/not-expected'),
          content: 'wrong author',
          id,
          to: new URL(followersUri),
        }),
    },
    {
      expectedStatus: ActivityPubQuoteStatus.APPROVED,
      name: 'public-audience',
      note: (id: URL) =>
        new Note({
          attribution: new URL('https://source.example/users/private-validation'),
          content: 'public is not private admission',
          id,
          to: PUBLIC_COLLECTION,
        }),
    },
  ] as const;

  for (const currentCase of cases) {
    const sourceUri = new URL(`https://source.example/notes/private-${currentCase.name}`);
    const quoteUri = new URL(`https://quote.example/notes/private-${currentCase.name}`);
    const quote = await createRemotePost(quoteActor.id, quoteUri.href);
    const keyCalls: string[] = [];
    const signedKeyIds: string[] = [];
    const lookupObject = mock.fn(async () => currentCase.note(sourceUri, sourceFollowersUri));
    const authorized = await authorizeQuoteSource({
      note: new Note({
        attribution: new URL('https://quote.example/users/private-validation'),
        id: quoteUri,
        quote: sourceUri,
        to: PUBLIC_COLLECTION,
      }),
      sourceAuthorUri: 'https://source.example/users/private-validation',
      sourceUri,
    });
    const result = await handleInboundQuote({
      actorUri: 'https://quote.example/users/private-validation',
      context: createSignedContext(
        keyPairs,
        keyCalls,
        signedKeyIds,
        lookupObject,
        authorized.documents,
      ),
      note: authorized.note,
      postId: quote.post.id,
      receivedAt,
      startWorkflow: false,
    });

    assert.deepEqual(result, { retryable: false, status: currentCase.expectedStatus });
    assert.equal(lookupObject.mock.calls.length, 1);
    assert.equal(
      await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)),
      currentCase.expectedStatus === ActivityPubQuoteStatus.APPROVED ? 1 : 0,
    );
  }
});

test('동시 실행한 같은 private Source는 하나의 Post와 각 Quote의 현재 revision으로 수렴한다', async () => {
  const sourceActor = await createRemoteActor(
    'private-concurrent-source',
    'https://source.example/users/private-concurrent',
  );
  const sourceFollowersUri = 'https://source.example/users/private-concurrent/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-concurrent-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-concurrent-quote',
    'https://quote.example/users/private-concurrent',
  );
  const firstQuoteUri = new URL('https://quote.example/notes/private-concurrent-1');
  const secondQuoteUri = new URL('https://quote.example/notes/private-concurrent-2');
  const firstQuote = await createRemotePost(quoteActor.id, firstQuoteUri.href);
  const secondQuote = await createRemotePost(quoteActor.id, secondQuoteUri.href);
  const sourceUri = new URL('https://source.example/notes/private-concurrent');
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-concurrent'),
    content: 'one source for concurrent quotes',
    id: sourceUri,
    to: new URL(sourceFollowersUri),
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
  ]);
  let lookupCount = 0;
  let releaseLookups!: () => void;
  const bothLookupsArrived = new Promise<void>((resolve) => {
    releaseLookups = resolve;
  });
  const lookupObject = mock.fn(async () => {
    lookupCount += 1;
    if (lookupCount === 2) {
      releaseLookups();
    }
    await bothLookupsArrived;
    return sourceNote;
  });
  const quoteInputs = await Promise.all(
    [
      { postId: firstQuote.post.id, quoteUri: firstQuoteUri },
      { postId: secondQuote.post.id, quoteUri: secondQuoteUri },
    ].map(async ({ postId, quoteUri }) => ({
      postId,
      authorized: await authorizeQuoteSource({
        note: new Note({
          attribution: new URL('https://quote.example/users/private-concurrent'),
          id: quoteUri,
          quote: sourceUri,
          to: PUBLIC_COLLECTION,
        }),
        sourceAuthorUri: 'https://source.example/users/private-concurrent',
        sourceUri,
      }),
    })),
  );

  const [firstResult, secondResult] = await Promise.all(
    quoteInputs.map(({ authorized, postId }) =>
      handleInboundQuote({
        actorUri: 'https://quote.example/users/private-concurrent',
        context: createSignedContext(keyPairs, [], [], lookupObject, authorized.documents),
        note: authorized.note,
        postId,
        receivedAt,
        startWorkflow: false,
      }),
    ),
  );

  assert.deepEqual(firstResult, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  assert.deepEqual(secondResult, { retryable: false, status: ActivityPubQuoteStatus.APPROVED });
  const sourcePosts = await db
    .select()
    .from(ActivityPubPosts)
    .where(eq(ActivityPubPosts.uri, sourceUri.href));
  assert.equal(sourcePosts.length, 1);
  const quotePosts = await db
    .select({ repostSourceId: Posts.repostSourceId })
    .from(Posts)
    .where(eq(Posts.id, firstQuote.post.id));
  const secondQuotePosts = await db
    .select({ repostSourceId: Posts.repostSourceId })
    .from(Posts)
    .where(eq(Posts.id, secondQuote.post.id));
  assert.equal(quotePosts[0]?.repostSourceId, sourcePosts[0]?.postId);
  assert.equal(secondQuotePosts[0]?.repostSourceId, sourcePosts[0]?.postId);
  assert.equal(lookupObject.mock.calls.length, 2);
});

test('private Source fetch 중 revision이 stale해지면 늦은 응답을 저장하거나 연결하지 않는다', async () => {
  const sourceActor = await createRemoteActor(
    'private-stale-source',
    'https://source.example/users/private-stale',
  );
  const sourceFollowersUri = 'https://source.example/users/private-stale/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri: sourceFollowersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-stale-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-stale-quote',
    'https://quote.example/users/private-stale',
  );
  const quoteUri = new URL('https://quote.example/notes/private-stale');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const sourceUri = new URL('https://source.example/notes/private-stale');
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-stale'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-stale',
    sourceUri,
  });
  await db.insert(ActivityPubPostQuotes).values({
    approvalUri: authorized.note.quoteAuthorizationId!.href,
    format: ActivityPubQuoteFormat.FEP_044F,
    postId: quote.post.id,
    resolutionRevision: 1,
    status: ActivityPubQuoteStatus.PENDING,
    targetUri: sourceUri.href,
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const keyPairs = new Map([
    [follower.id, { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) }],
  ]);
  const lookupObject = mock.fn(async () => {
    await db
      .update(ActivityPubPostQuotes)
      .set({ resolutionRevision: 2, status: ActivityPubQuoteStatus.REVOKED })
      .where(eq(ActivityPubPostQuotes.postId, quote.post.id));
    return new Note({
      attribution: new URL('https://source.example/users/private-stale'),
      content: 'late private source',
      id: sourceUri,
      to: new URL(sourceFollowersUri),
    });
  });

  const result = await resolveStoredInboundQuote({
    context: createSignedContext(keyPairs, [], [], lookupObject, authorized.documents),
    postId: quote.post.id,
    receivedAt,
    revision: 1,
  });

  assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.REVOKED });
  assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)), 0);
  assert.equal(
    (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
      .repostSourceId,
    null,
  );
});

test('private Source 생성 뒤 Quote revision이 바뀌면 Source와 post-commit effect를 함께 rollback한다', async () => {
  const sourceActor = await createRemoteActor(
    'private-commit-race-source',
    'https://source.example/users/private-commit-race',
  );
  const followersUri = 'https://source.example/users/private-commit-race/followers';
  await db
    .update(ActivityPubActors)
    .set({ followersUri })
    .where(eq(ActivityPubActors.profileId, sourceActor.id));
  const follower = await createLocalProfile('private-commit-race-follower');
  await db.insert(ProfileFollows).values({
    followerProfileId: follower.id,
    followeeProfileId: sourceActor.id,
  });
  const quoteActor = await createRemoteActor(
    'private-commit-race-quote',
    'https://quote.example/users/private-commit-race',
  );
  const sourceUri = new URL('https://source.example/notes/private-commit-race');
  const quoteUri = new URL('https://quote.example/notes/private-commit-race');
  const quote = await createRemotePost(quoteActor.id, quoteUri.href);
  const authorized = await authorizeQuoteSource({
    note: new Note({
      attribution: new URL('https://quote.example/users/private-commit-race'),
      id: quoteUri,
      quote: sourceUri,
      to: PUBLIC_COLLECTION,
    }),
    sourceAuthorUri: 'https://source.example/users/private-commit-race',
    sourceUri,
  });
  await db.insert(ActivityPubPostQuotes).values({
    approvalUri: authorized.note.quoteAuthorizationId!.href,
    format: ActivityPubQuoteFormat.FEP_044F,
    postId: quote.post.id,
    resolutionRevision: 1,
    status: ActivityPubQuoteStatus.PENDING,
    targetUri: sourceUri.href,
  });
  const sourceNote = new Note({
    attribution: new URL('https://source.example/users/private-commit-race'),
    content: 'private commit race source',
    id: sourceUri,
    to: new URL(followersUri),
  });
  Object.defineProperty(sourceNote, 'getAttachments', {
    configurable: true,
    value: async function* () {
      await db
        .update(ActivityPubPostQuotes)
        .set({ resolutionRevision: 2, status: ActivityPubQuoteStatus.REVOKED })
        .where(eq(ActivityPubPostQuotes.postId, quote.post.id));
      yield* [];
    },
  });
  const keyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const workflowStart = mock.method(
    temporalClient.workflow,
    'start',
    async () => undefined as never,
  );

  try {
    const result = await resolveStoredInboundQuote({
      context: createSignedContext(
        new Map([
          [
            follower.id,
            { ...keyPair, keyId: new URL(`https://local.example/keys/${follower.id}`) },
          ],
        ]),
        [],
        [],
        async () => sourceNote,
        authorized.documents,
      ),
      postId: quote.post.id,
      receivedAt,
      revision: 1,
    });

    assert.deepEqual(result, { retryable: false, status: ActivityPubQuoteStatus.REVOKED });
    assert.equal(await db.$count(ActivityPubPosts, eq(ActivityPubPosts.uri, sourceUri.href)), 0);
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, quote.post.id)).then(firstOrThrow))
        .repostSourceId,
      null,
    );
    assert.equal(workflowStart.mock.callCount(), 0);
  } finally {
    workflowStart.mock.restore();
  }
});

const createContext = (
  documents = new Map<string, unknown>(),
  lookupObject: (identifier: string | URL, options?: unknown) => Promise<unknown> = async () =>
    null,
) => {
  const contextLoader = getDocumentLoader();
  return {
    canonicalOrigin: publicOrigin,
    contextLoader,
    documentLoader: async (url: string) => {
      const document = documents.get(url);
      if (!document) {
        throw new Error(`unexpected remote lookup in deterministic quote test: ${url}`);
      }
      return { contextUrl: null, document, documentUrl: url };
    },
    lookupObject,
    parseUri: () => null,
  } as never;
};

const createLocalProfile = async (handle: string) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: localInstanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createSignedContext = (
  keyPairs: ReadonlyMap<string, { keyId: URL; privateKey: CryptoKey }>,
  keyCalls: string[],
  signedKeyIds: string[],
  lookupObject: (identifier: string | URL, options?: unknown) => Promise<unknown>,
  documents = new Map<string, unknown>(),
  signedLoaderUrls: string[] = [],
) => {
  const context = createContext(documents, lookupObject) as unknown as Record<string, unknown>;
  return Object.assign(context, {
    getActorKeyPairs: async (profileId: string) => {
      keyCalls.push(profileId);
      const keyPair = keyPairs.get(profileId);
      return (keyPair ? [keyPair] : []) as never;
    },
    getDocumentLoader: ({ keyId, privateKey }: { keyId: URL; privateKey: CryptoKey }) => {
      assert.ok(privateKey);
      signedKeyIds.push(keyId.href);
      return (async (url: string) => {
        signedLoaderUrls.push(url);
        return { contextUrl: null, document: {}, documentUrl: url };
      }) as never;
    },
  }) as never;
};

let quoteAuthorizationSequence = 0;

const authorizeQuoteSource = async ({
  note,
  sourceAuthorUri,
  sourceUri,
}: {
  note: Note;
  sourceAuthorUri: string;
  sourceUri: URL;
}) => {
  const authorization = quoteInteraction.createAuthorization({
    attributedTo: new URL(sourceAuthorUri),
    id: new URL(`/authorizations/test-${quoteAuthorizationSequence++}`, sourceUri.origin),
    interactingObject: note,
    interactionTarget: sourceUri,
  });
  return {
    documents: new Map([
      [authorization.id!.href, await authorization.toJsonLd({ format: 'expand' })],
    ]),
    note: note.clone({ quoteAuthorization: authorization.id! }),
  };
};

const createRemoteActor = async (handle: string, actorUri: string) => {
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: new URL(actorUri).origin,
      domain: new URL(actorUri).hostname,
      kind: InstanceKind.ACTIVITYPUB,
      state: InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId: instance.id,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  await db.insert(ActivityPubActors).values({
    profileId: profile.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri,
  });
  return profile;
};

const createRemotePost = async (profileId: string, objectUri: string) => {
  const result = await createPost({
    document: postContentDocumentFromText(objectUri),
    mentionProfileIds: [],
    objectUri,
    origin: 'ACTIVITYPUB',
    profileId,
    publishedAt: null,
    receivedAt,
    visibility: PostVisibility.PUBLIC,
  });
  assert.equal(result.created, true);
  return result;
};
