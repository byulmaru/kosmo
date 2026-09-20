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

const createContext = (
  documents = new Map<string, unknown>(),
  lookupObject: (identifier: string | URL) => Promise<unknown> = async () => null,
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
