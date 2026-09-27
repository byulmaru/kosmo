import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import {
  Accept,
  Delete,
  Note,
  PUBLIC_COLLECTION,
  QuoteAuthorization,
  QuoteRequest,
} from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  PostQuoteRevocations,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import {
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  PostQuoteConsentStatus,
  PostQuotePolicy,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import {
  applyInboundQuoteRevocation,
  deletePostPersisted,
  postQuoteConsentColumns,
} from '@kosmo/core/services';
import { temporalClient } from '@kosmo/core/temporal/client';
import { eq, ne } from 'drizzle-orm';
import { federation } from './federation';
import {
  handleInboundQuoteAccept,
  handleInboundQuoteRequest,
  handleInboundQuoteRevocation,
} from './inbound-quote';
import { dispatchLocalQuoteAuthorization } from './local-quote-authorization';
import type { ForwardActivityOptions, InboxContext } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';

const publicOrigin = 'http://127.0.0.1:4173';
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const receivedAt = Temporal.Instant.from('2026-09-17T00:00:00Z');

let localInstanceId: string;

describe('ActivityPub inbound Quote lifecycle', () => {
  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    const { localInstance } = await (
      await import('@kosmo/core/db/seed')
    ).seedDatabase({
      publicOrigin,
    });
    localInstanceId = localInstance.id;
  });

  beforeEach(async () => {
    await db.delete(PostQuoteRevocations);
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

  test('Workflow admission 실패는 동의 상태를 변경하지 않는다', async (t) => {
    const source = await createLocalSource();
    const remote = await createRemoteActor('https://quote-author.example/users/admission');
    const requestUri = 'https://quote-author.example/requests/admission';
    t.mock.method(temporalClient.workflow, 'executeUpdateWithStart', async () => {
      throw new Error('Temporal unavailable');
    });
    await assert.rejects(
      handleInboundQuoteRequest(
        createContext(),
        createQuoteRequest({
          actorUri: remote.actorUri,
          quoteUri: 'https://quote-author.example/notes/admission',
          requestUri,
          sourceUri: source.sourceUri,
        }),
        receivedAt,
      ),
      /Temporal unavailable/,
    );
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.quoteConsentRequestUri, requestUri))
      ).length,
      0,
    );
  });

  test('검증된 QuoteRequest는 원격 Quote를 먼저 저장하고 QuoteAuthorization을 발급한다', async () => {
    const source = await createLocalSource();
    const remote = await createRemoteActor('https://quote-author.example/users/alice');
    const quoteUri = 'https://quote-author.example/notes/quote-1';
    const requestUri = 'https://quote-author.example/quote-requests/quote-1';
    const request = createQuoteRequest({
      actorUri: remote.actorUri,
      quoteUri,
      requestUri,
      sourceUri: source.sourceUri,
    });
    const sent: SentActivity[] = [];

    await handleInboundQuoteRequest(
      createContext({
        sendActivity: async (_sender, recipients, activity) => {
          sent.push({ activity, recipients: toRecipients(recipients) });
        },
      }),
      request,
      receivedAt,
    );

    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.quoteConsentRequestUri, requestUri))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.APPROVED);
    assert.ok(consent.quotePostId);
    const storedQuote = await db
      .select()
      .from(Posts)
      .where(eq(Posts.id, consent.quotePostId))
      .then(firstOrThrow);
    assert.equal(storedQuote.profileId, remote.profileId);
    assert.ok(storedQuote.currentContentId);
    const remotePost = await db
      .select()
      .from(ActivityPubPosts)
      .where(eq(ActivityPubPosts.postId, storedQuote.id))
      .then(firstOrThrow);
    assert.equal(remotePost.uri, quoteUri);
    assert.equal(consent.approvalUri, source.approvalUri(requestUri));
    const authorization = await dispatchLocalQuoteAuthorization(
      federation.createContext(new Request(source.approvalUri(requestUri)), undefined),
    );
    assert.ok(authorization);
    assert.equal(authorization.interactingObjectId?.href, quoteUri);
    assert.equal(authorization.interactionTargetId?.href, source.sourceUri);
    assert.equal(storedQuote.repostSourceId, null);
  });

  test('FEP quote만 있는 요청을 승인하고 충돌하는 legacy quoteUrl은 거부한다', async () => {
    const source = await createLocalSource();
    const remote = await createRemoteActor('https://quote-author.example/users/fep');
    const sent: SentActivity[] = [];
    const context = createContext({
      sendActivity: async (_sender, recipients, activity) => {
        sent.push({ activity, recipients: toRecipients(recipients) });
      },
    });
    for (const legacy of [null, new URL('https://other.example/notes/source')]) {
      const requestUri = `https://quote-author.example/requests/${legacy ? 'conflict' : 'fep'}`;
      await handleInboundQuoteRequest(
        context,
        new QuoteRequest({
          actor: remote.actorUri,
          id: new URL(requestUri),
          object: new URL(source.sourceUri),
          instrument: new Note({
            attribution: remote.actorUri,
            id: new URL(`https://quote-author.example/notes/${legacy ? 'conflict' : 'fep'}`),
            content: 'remote quote',
            to: PUBLIC_COLLECTION,
            quote: new URL(source.sourceUri),
            quoteUrl: legacy,
          }),
        }),
        receivedAt,
      );
      const consents = await db
        .select(postQuoteConsentColumns)
        .from(Posts)
        .where(eq(Posts.quoteConsentRequestUri, requestUri));
      assert.equal(consents.length, legacy ? 0 : 1);
      if (!legacy) {
        assert.equal(consents[0]?.status, PostQuoteConsentStatus.APPROVED);
      }
    }
  });

  test('Quote 본문 저장에 실패하면 동의나 승인 응답을 만들지 않는다', async () => {
    const source = await createLocalSource();
    const remote = await createRemoteActor('https://quote-author.example/users/empty');
    const requestUri = 'https://quote-author.example/requests/empty';
    const sent: SentActivity[] = [];
    await handleInboundQuoteRequest(
      createContext({
        sendActivity: async (_sender, recipients, activity) => {
          sent.push({ activity, recipients: toRecipients(recipients) });
        },
      }),
      new QuoteRequest({
        actor: remote.actorUri,
        id: new URL(requestUri),
        object: new URL(source.sourceUri),
        instrument: new Note({
          attribution: remote.actorUri,
          id: new URL('https://quote-author.example/notes/empty'),
          to: PUBLIC_COLLECTION,
          quote: new URL(source.sourceUri),
        }),
      }),
      receivedAt,
    );
    assert.equal(sent.length, 0);
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.quoteConsentRequestUri, requestUri))
      ).length,
      0,
    );

    assert.equal((await db.select().from(ActivityPubPosts)).length, 0);
  });

  test('정책상 허용되지 않는 QuoteRequest는 거절 상태를 저장한다', async () => {
    const source = await createLocalSource({ policy: PostQuotePolicy.AUTHOR });
    const remote = await createRemoteActor('https://quote-author.example/users/bob');
    const quoteUri = 'https://quote-author.example/notes/quote-2';
    const requestUri = 'https://quote-author.example/quote-requests/quote-2';
    const sent: SentActivity[] = [];

    await handleInboundQuoteRequest(
      createContext({
        sendActivity: async (_sender, recipients, activity) => {
          sent.push({ activity, recipients: toRecipients(recipients) });
        },
      }),
      createQuoteRequest({
        actorUri: remote.actorUri,
        quoteUri,
        requestUri,
        sourceUri: source.sourceUri,
      }),
      receivedAt,
    );

    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.quoteConsentRequestUri, requestUri))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.REJECTED);
    assert.equal(consent.approvalUri, null);
  });

  test('Accept는 QuoteRequest·Source·QuoteAuthorization의 URI 결속이 맞을 때만 승인한다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote();
    const authorizationUri = 'https://remote-source.example/quote-authorizations/quote-1';
    const request = createQuoteRequest({
      actorUri: fixture.quoteActorUri,
      quoteUri: fixture.quoteUri,
      requestUri: fixture.requestUri,
      sourceUri: fixture.sourceUri,
    });
    const accept = new Accept({
      actor: fixture.sourceActorUri,
      object: request,
      result: new QuoteAuthorization({
        attribution: fixture.sourceActorUri,
        id: new URL(authorizationUri),
        interactingObject: fixture.quoteUri,
        interactionTarget: fixture.sourceUri,
      }),
    });
    mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    await handleInboundQuoteAccept({ accept, context: createContext(), request });

    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.id, fixture.consentId))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.APPROVED);
    assert.equal(consent.approvalUri, authorizationUri);
    assert.equal(consent.revision, 2);
    await handleInboundQuoteAccept({ accept, context: createContext(), request });
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).revision,
      2,
    );
  });

  test('QuoteAuthorization 철회가 Accept보다 먼저 와도 늦은 Accept가 승인을 되살리지 않는다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote();
    const request = createQuoteRequest({
      actorUri: fixture.quoteActorUri,
      quoteUri: fixture.quoteUri,
      requestUri: fixture.requestUri,
      sourceUri: fixture.sourceUri,
    });
    const accept = new Accept({
      actor: fixture.sourceActorUri,
      object: request,
      result: new QuoteAuthorization({
        attribution: fixture.sourceActorUri,
        id: fixture.approvalUri,
        interactingObject: fixture.quoteUri,
        interactionTarget: fixture.sourceUri,
      }),
    });
    mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    let forwarded = 0;
    const context = createContext({
      forwardActivity: async () => {
        forwarded += 1;
      },
    });

    assert.equal(
      await handleInboundQuoteRevocation(
        context,
        new Delete({
          actor: fixture.sourceActorUri,
          object: fixture.approvalUri,
          target: fixture.sourceUri,
        }),
      ),
      true,
    );
    await handleInboundQuoteAccept({ accept, context: createContext(), request });

    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.id, fixture.consentId))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
    assert.equal(consent.approvalUri, fixture.approvalUri.href);
    assert.equal(consent.revision, 2);
    await handleInboundQuoteRevocation(
      context,
      new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      }),
    );
    assert.equal(forwarded, 0);
    assert.equal(
      (
        await db
          .select()
          .from(PostQuoteRevocations)
          .where(eq(PostQuoteRevocations.approvalUri, fixture.approvalUri.href))
          .then(firstOrThrow)
      ).forwardEligible,
      false,
    );
  });

  test('pending 조회 뒤 승인된 Quote의 철회도 팔로워에게 전달한다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote();
    const request = createQuoteRequest({
      actorUri: fixture.quoteActorUri,
      quoteUri: fixture.quoteUri,
      requestUri: fixture.requestUri,
      sourceUri: fixture.sourceUri,
    });
    const accept = new Accept({
      actor: fixture.sourceActorUri,
      object: request,
      result: new QuoteAuthorization({
        attribution: fixture.sourceActorUri,
        id: fixture.approvalUri,
        interactingObject: fixture.quoteUri,
        interactionTarget: fixture.sourceUri,
      }),
    });
    const executeUpdate = temporalClient.workflow.executeUpdateWithStart.bind(
      temporalClient.workflow,
    );
    let acceptedBetweenReadAndTransition = false;
    t.mock.method(temporalClient.workflow, 'executeUpdateWithStart', async (update, options) => {
      const command = options.startWorkflowOperation.options.args?.[0] as
        | { kind?: string }
        | undefined;
      if (command?.kind === 'revoke' && !acceptedBetweenReadAndTransition) {
        acceptedBetweenReadAndTransition = true;
        await handleInboundQuoteAccept({ accept, context: createContext(), request });
      }
      return executeUpdate(update, options);
    });
    let forwarded = 0;
    const context = createContext({
      forwardActivity: async () => {
        forwarded += 1;
      },
    });
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });
    assert.equal(await handleInboundQuoteRevocation(context, revocation), true);
    assert.equal(acceptedBetweenReadAndTransition, true);
    assert.equal(forwarded, 1);
    const tombstone = await db
      .select()
      .from(PostQuoteRevocations)
      .where(eq(PostQuoteRevocations.approvalUri, fixture.approvalUri.href))
      .then(firstOrThrow);
    assert.equal(tombstone.forwardEligible, true);
    const repeatedTransition = await applyInboundQuoteRevocation({
      approvalUri: fixture.approvalUri.href,
      quoteUri: fixture.quoteUri.href,
      sourceAuthorActorUri: fixture.sourceActorUri.href,
      sourceUri: fixture.sourceUri.href,
    });
    assert.equal(repeatedTransition?.forwardEligible, true);

    assert.ok(tombstone.forwardedAt);
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, fixture.consentId)).then(firstOrThrow))
        .quoteConsentStatus,
      PostQuoteConsentStatus.REVOKED,
    );
    await handleInboundQuoteRevocation(context, revocation);
    assert.equal(forwarded, 1);
  });

  for (const approved of [true, false]) {
    test(`Remote Source 삭제 후 원본 철회는 ${approved ? '승인되었던 Quote에만 한 번 전달한다' : 'pending Quote에 전달하지 않는다'}`, async () => {
      const fixture = await createRemoteSourceAndPendingQuote({ approved });
      await deletePostPersisted({
        actorProfileId: fixture.sourceAuthorId,
        postId: fixture.sourcePostId,
        origin: 'ACTIVITYPUB',
      });
      assert.equal(
        (await db.select().from(Posts).where(eq(Posts.id, fixture.consentId)).then(firstOrThrow))
          .quoteConsentStatus,
        PostQuoteConsentStatus.REVOKED,
      );
      let forwarded = 0;
      const context = createContext({
        forwardActivity: async () => {
          forwarded += 1;
        },
      });
      const revocation = new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      });
      await handleInboundQuoteRevocation(context, revocation);
      await handleInboundQuoteRevocation(context, revocation);
      assert.equal(forwarded, approved ? 1 : 0);
      const [tombstone] = await db
        .select()
        .from(PostQuoteRevocations)
        .where(eq(PostQuoteRevocations.approvalUri, fixture.approvalUri.href));
      assert.equal(tombstone?.forwardEligible ?? false, approved);
      if (approved) {
        assert.ok(tombstone?.forwardedAt);
      }
    });
  }

  test('Source 삭제는 충돌하는 철회 identity를 덮어쓰지 않고 transaction을 rollback한다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    await db.insert(PostQuoteRevocations).values({
      approvalUri: fixture.approvalUri.href,
      sourceAuthorActorUri: fixture.sourceActorUri.href,
      sourceUri: 'https://remote-source.example/notes/different-source',
      quoteUri: fixture.quoteUri.href,
    });
    await assert.rejects(
      deletePostPersisted({
        actorProfileId: fixture.sourceAuthorId,
        postId: fixture.sourcePostId,
        origin: 'ACTIVITYPUB',
      }),
      /binding does not match/,
    );
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, fixture.sourcePostId)).then(firstOrThrow))
        .state,
      PostState.ACTIVE,
    );
    assert.equal(
      (await db.select().from(Posts).where(eq(Posts.id, fixture.consentId)).then(firstOrThrow))
        .quoteConsentStatus,
      PostQuoteConsentStatus.APPROVED,
    );
    assert.equal(
      (
        await db
          .select()
          .from(PostQuoteRevocations)
          .where(eq(PostQuoteRevocations.approvalUri, fixture.approvalUri.href))
          .then(firstOrThrow)
      ).forwardEligible,
      false,
    );
  });

  test('대응하는 pending consent가 없는 선도착 Delete는 철회로 저장하지 않는다', async () => {
    const approvalUri = new URL('https://remote-source.example/quote-authorizations/unknown');

    assert.equal(
      await handleInboundQuoteRevocation(
        createContext(),
        new Delete({
          actor: new URL('https://remote-source.example/users/source-author'),
          object: approvalUri,
          target: new URL('https://remote-source.example/posts/unknown'),
        }),
      ),
      false,
    );
    assert.equal(
      await db
        .select({ id: PostQuoteRevocations.id })
        .from(PostQuoteRevocations)
        .where(eq(PostQuoteRevocations.approvalUri, approvalUri.href))
        .then((rows) => rows.length),
      0,
    );
  });

  test('위조된 Accept와 철회 전달 실패는 Source를 부활시키지 않고 재시도 가능하게 수렴한다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const request = createQuoteRequest({
      actorUri: fixture.quoteActorUri,
      quoteUri: fixture.quoteUri,
      requestUri: fixture.requestUri,
      sourceUri: fixture.sourceUri,
    });
    const forgedAccept = new Accept({
      actor: new URL('https://other-source.example/users/attacker'),
      object: request,
      result: new QuoteAuthorization({
        attribution: fixture.sourceActorUri,
        id: new URL('https://remote-source.example/quote-authorizations/forged'),
        interactingObject: fixture.quoteUri,
        interactionTarget: fixture.sourceUri,
      }),
    });
    mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    await handleInboundQuoteAccept({ accept: forgedAccept, context: createContext(), request });
    assert.equal(
      await db
        .select({ status: Posts.quoteConsentStatus })
        .from(Posts)
        .where(eq(Posts.id, fixture.consentId))
        .then(firstOrThrow)
        .then(({ status }) => status),
      PostQuoteConsentStatus.APPROVED,
    );

    let forwardAttempts = 0;
    const failingContext = createContext({
      forwardActivity: async () => {
        forwardAttempts += 1;
        throw new Error('temporary forward failure');
      },
    });
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });
    await assert.rejects(handleInboundQuoteRevocation(failingContext, revocation), /temporary/);
    assert.equal(forwardAttempts, 1);
    assert.equal(
      await db
        .select({ status: Posts.quoteConsentStatus })
        .from(Posts)
        .where(eq(Posts.id, fixture.consentId))
        .then(firstOrThrow)
        .then(({ status }) => status),
      PostQuoteConsentStatus.REVOKED,
    );

    const forwarded: unknown[][] = [];
    await handleInboundQuoteRevocation(
      createContext({
        forwardActivity: async (...args) => {
          forwarded.push(args);
        },
      }),
      revocation,
    );
    assert.equal(forwarded.length, 1);
    assert.deepEqual(forwarded[0]?.slice(0, 2), [
      { identifier: fixture.quoteAuthorId },
      'followers',
    ]);

    await handleInboundQuoteRevocation(
      createContext({
        forwardActivity: async (...args) => {
          forwarded.push(args);
        },
      }),
      revocation,
    );
    assert.equal(forwarded.length, 1);

    await handleInboundQuoteRevocation(
      createContext(),
      new Delete({
        actor: new URL('https://other-source.example/users/attacker'),
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      }),
    );
    assert.equal(
      await db
        .select({ status: Posts.quoteConsentStatus })
        .from(Posts)
        .where(eq(Posts.id, fixture.consentId))
        .then(firstOrThrow)
        .then(({ status }) => status),
      PostQuoteConsentStatus.REVOKED,
    );
    assert.equal(forwarded.length, 1);
  });

  test('target 없는 승인 철회는 적용하고 잘못된 target은 거부한다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    mock.method(temporalClient.workflow, 'start', async () => undefined as never);
    let forwards = 0;
    const context = createContext({
      forwardActivity: async () => {
        forwards += 1;
      },
    });
    await handleInboundQuoteRevocation(
      context,
      new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: new URL('https://remote-source.example/notes/wrong'),
      }),
    );
    const loadConsent = () =>
      db
        .select(postQuoteConsentColumns)
        .from(Posts)
        .where(eq(Posts.id, fixture.consentId))
        .then(firstOrThrow);
    assert.equal((await loadConsent()).status, PostQuoteConsentStatus.APPROVED);
    assert.equal(forwards, 0);
    const revocation = new Delete({ actor: fixture.sourceActorUri, object: fixture.approvalUri });
    assert.equal(await handleInboundQuoteRevocation(context, revocation), true);
    assert.equal((await loadConsent()).status, PostQuoteConsentStatus.REVOKED);
    assert.equal(forwards, 1);
    await handleInboundQuoteRevocation(context, revocation);
    assert.equal(forwards, 1);
  });

  test('동시에 중복 수신한 철회는 팔로워에게 한 번만 전달한다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    mock.method(temporalClient.workflow, 'start', async () => undefined as never);

    let releaseForward!: () => void;
    const forwardReleased = new Promise<void>((resolve) => {
      releaseForward = resolve;
    });
    let observeForward!: () => void;
    const forwardObserved = new Promise<void>((resolve) => {
      observeForward = resolve;
    });
    let forwardAttempts = 0;
    const context = createContext({
      forwardActivity: async () => {
        forwardAttempts += 1;
        observeForward();
        await forwardReleased;
      },
    });
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });

    const first = handleInboundQuoteRevocation(context, revocation);
    await forwardObserved;
    await handleInboundQuoteRevocation(context, revocation);
    releaseForward();
    await first;

    assert.equal(forwardAttempts, 1);
  });
});

type SentActivity = {
  readonly activity: Activity;
  readonly recipients: Recipient[];
};

type TestForwardActivity = (
  forwarder: { readonly identifier: string },
  recipients: 'followers',
  options?: ForwardActivityOptions,
) => Promise<void>;

const createContext = ({
  forwardActivity = async () => undefined,
  sendActivity = async () => undefined,
}: {
  readonly forwardActivity?: TestForwardActivity;
  readonly sendActivity?: (
    sender: { readonly identifier: string },
    recipients: Recipient | Recipient[],
    activity: Activity,
  ) => Promise<void>;
} = {}): InboxContext<void> => {
  const base = federation.createContext(new Request(`${publicOrigin}/inbox`), undefined);
  return {
    canonicalOrigin: base.canonicalOrigin,
    documentLoader: async (url: string) => {
      throw new Error(`Unexpected document lookup: ${url}`);
    },
    forwardActivity,
    getActorUri: base.getActorUri.bind(base),
    lookupObject: async (url: URL) => {
      throw new Error(`Unexpected object lookup: ${url.href}`);
    },
    parseUri: base.parseUri.bind(base),
    recipient: null,
    sendActivity,
  } as unknown as InboxContext<void>;
};

const toRecipients = (recipients: Recipient | Recipient[]): Recipient[] =>
  Array.isArray(recipients) ? recipients : [recipients];

const createProfile = async (instanceId: string, handle: string) =>
  db
    .insert(Profiles)
    .values({
      displayName: handle,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle,
      instanceId,
      normalizedHandle: handle,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

const createLocalSource = async ({
  policy = PostQuotePolicy.EVERYONE,
  visibility = PostVisibility.PUBLIC,
}: {
  readonly policy?: PostQuotePolicy;
  readonly visibility?: PostVisibility;
} = {}) => {
  const author = await createProfile(localInstanceId, 'source-author');
  const actorUri = new URL(`/ap/actor/${author.id}`, publicOrigin);
  await db.insert(ActivityPubActors).values({
    profileId: author.id,
    type: ActivityPubActorType.PERSON,
    uri: actorUri.href,
  });
  const post = await createContentPost(author.id, visibility);
  if (policy !== PostQuotePolicy.EVERYONE) {
    await db.update(Posts).set({ quotePolicy: policy }).where(eq(Posts.id, post.id));
  }
  return {
    approvalUri: (requestUri: string) =>
      new URL(`/ap/quote-authorization/${encodeURIComponent(requestUri)}`, publicOrigin).href,
    authorId: author.id,
    sourceUri: new URL(`/ap/note/${post.id}`, publicOrigin).href,
  };
};

const createRemoteActor = async (actorUri: string) => {
  const uri = new URL(actorUri);
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
  const profile = await createProfile(instance.id, `remote-${uri.hostname.replaceAll('.', '-')}`);
  await db.insert(ActivityPubActors).values({
    inboxUri: `${uri.origin}/inbox`,
    profileId: profile.id,
    sharedInboxUri: `${uri.origin}/inbox`,
    type: ActivityPubActorType.PERSON,
    uri: uri.href,
  });
  return { actorUri: uri, profileId: profile.id };
};

const createContentPost = async (
  profileId: string,
  visibility: PostVisibility = PostVisibility.PUBLIC,
) => {
  const post = await db
    .insert(Posts)
    .values({ profileId, state: PostState.ACTIVE, visibility })
    .returning()
    .then(firstOrThrow);
  const content = await db
    .insert(PostContents)
    .values({
      document: postContentDocumentFromText('quote lifecycle'),
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

const createQuoteRequest = ({
  actorUri,
  quoteUri,
  requestUri,
  sourceUri,
}: {
  readonly actorUri: URL;
  readonly quoteUri: URL | string;
  readonly requestUri: URL | string;
  readonly sourceUri: URL | string;
}) =>
  new QuoteRequest({
    actor: actorUri,
    id: new URL(requestUri),
    instrument: new Note({
      attribution: actorUri,
      id: new URL(quoteUri),
      content: 'remote quote',
      to: PUBLIC_COLLECTION,
      quote: new URL(sourceUri),
      quoteUrl: new URL(sourceUri),
    }),
    object: new URL(sourceUri),
  });

const createRemoteSourceAndPendingQuote = async ({ approved = false } = {}) => {
  const sourceActor = await createRemoteActor('https://remote-source.example/users/author');
  const sourcePost = await createContentPost(sourceActor.profileId);
  const sourceUri = 'https://remote-source.example/notes/source-1';
  await db.insert(ActivityPubPosts).values({
    postId: sourcePost.id,
    receivedAt,
    uri: sourceUri,
  });
  const quoteAuthor = await createProfile(localInstanceId, 'quote-author');
  const quoteActorUri = new URL(`/ap/actor/${quoteAuthor.id}`, publicOrigin);
  await db.insert(ActivityPubActors).values({
    profileId: quoteAuthor.id,
    type: ActivityPubActorType.PERSON,
    uri: quoteActorUri.href,
  });
  const quotePost = await createContentPost(quoteAuthor.id);
  await db.update(Posts).set({ repostSourceId: sourcePost.id }).where(eq(Posts.id, quotePost.id));
  const quoteUri = new URL(`/ap/note/${quotePost.id}`, publicOrigin).href;
  const requestUri = new URL(`/ap/quote-request/${quotePost.id}`, publicOrigin).href;
  const approvalUri = 'https://remote-source.example/quote-authorizations/quote-1';
  const consent = await db
    .update(Posts)
    .set({
      quoteConsentApprovalUri: approved ? approvalUri : null,
      quoteConsentQuoteAuthorActorUri: quoteActorUri.href,
      quoteConsentQuoteUri: quoteUri,
      quoteConsentRequestUri: requestUri,
      quoteConsentSourceAuthorActorUri: sourceActor.actorUri.href,
      quoteConsentSourcePostId: sourcePost.id,
      quoteConsentSourceUri: sourceUri,
      quoteConsentStatus: approved
        ? PostQuoteConsentStatus.APPROVED
        : PostQuoteConsentStatus.PENDING,

      quoteConsentRevision: 1,
    })
    .where(eq(Posts.id, quotePost.id))
    .returning(postQuoteConsentColumns)
    .then(firstOrThrow);
  return {
    approvalUri: new URL(approvalUri),
    consentId: consent.id,
    quoteActorUri,
    quoteAuthorId: quoteAuthor.id,
    quoteUri: new URL(quoteUri),
    requestUri: new URL(requestUri),
    sourceActorUri: sourceActor.actorUri,
    sourceAuthorId: sourceActor.profileId,
    sourcePostId: sourcePost.id,
    sourceUri: new URL(sourceUri),
  };
};
