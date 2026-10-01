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
import { handleInboundDelete } from './inbound-delete';
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

  test('Accept는 QuoteRequest·Source·QuoteAuthorization의 URI 결속이 맞을 때만 승인한다', async (t) => {
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
    t.mock.method(temporalClient.workflow, 'start', async () => undefined as never);

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

  test('원격 Delete는 승인된 Quote를 REVOKED로 전이하지만 원본 Delete를 forwarding하지 않는다', async () => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const forwarded = mock.fn();
    const context = createContext({ forwardActivity: async (...args) => forwarded(...args) });

    await handleInboundDelete(
      context,
      new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      }),
    );
    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.id, fixture.consentId))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
    assert.equal(consent.revision, 2);
    assert.equal(forwarded.mock.calls.length, 0);
    const handle = temporalClient.workflow.getHandle(
      `post-quote-revoke:${fixture.approvalUri.href}`,
    );
    await handle.result();
    const history = await handle.fetchHistory();
    assert.equal(
      (history.events ?? []).filter(
        (event) =>
          event.activityTaskScheduledEventAttributes?.activityType?.name ===
          'sendLocalPostConsentUpdateActivity',
      ).length,
      1,
    );
  });

  test('pending 조회 뒤 Accept가 끼어들어도 동일한 Workflow가 Quote를 REVOKED로 수렴시킨다', async (t) => {
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
    t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async (...args: Parameters<typeof executeUpdate>) => {
        const [update, options] = args;
        const command = options.startWorkflowOperation.options.args?.[0] as
          | { kind?: string }
          | undefined;
        if (command?.kind === 'revoke' && !acceptedBetweenReadAndTransition) {
          acceptedBetweenReadAndTransition = true;
          await handleInboundQuoteAccept({ accept, context: createContext(), request });
        }
        return executeUpdate(update, options);
      },
    );
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });
    assert.equal(await handleInboundQuoteRevocation(revocation), true);
    assert.equal(acceptedBetweenReadAndTransition, true);
    const consent = await db
      .select(postQuoteConsentColumns)
      .from(Posts)
      .where(eq(Posts.id, fixture.consentId))
      .then(firstOrThrow);
    assert.equal(consent.status, PostQuoteConsentStatus.REVOKED);
    assert.equal(consent.revision, 3);
    assert.equal(
      (
        await applyInboundQuoteRevocation({
          approvalUri: fixture.approvalUri.href,
          quoteUri: fixture.quoteUri.href,
          sourceAuthorActorUri: fixture.sourceActorUri.href,
          sourceUri: fixture.sourceUri.href,
        })
      )?.revision,
      3,
    );
  });

  test('Delete가 선도착하고 늦은 Accept가 오면 Quote를 되살리지 않는다', async () => {
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
    await handleInboundQuoteRevocation(
      new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      }),
    );
    await handleInboundQuoteAccept({ accept, context: createContext(), request });
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.REVOKED,
    );
  });

  test('잘못된 target과 선도착 Delete는 상태를 변경하지 않는다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const executeUpdate = t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async () => null,
    );
    const wrongTarget = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: new URL('https://remote-source.example/notes/wrong'),
    });
    assert.equal(await handleInboundQuoteRevocation(wrongTarget), true);
    assert.equal(executeUpdate.mock.calls.length, 0);
    const unknown = new Delete({
      actor: fixture.sourceActorUri,
      object: new URL('https://remote-source.example/quote-authorizations/unknown'),
      target: fixture.sourceUri,
    });
    assert.equal(await handleInboundQuoteRevocation(unknown), false);
    assert.equal(executeUpdate.mock.calls.length, 0);
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.APPROVED,
    );
  });

  for (const approved of [true, false]) {
    test(`Source 삭제 후 ${approved ? '승인된' : 'pending'} Quote는 REVOKED로 남고 inbound Delete가 중복 Workflow를 만들지 않는다`, async (t) => {
      const fixture = await createRemoteSourceAndPendingQuote({ approved });
      await deletePostPersisted({
        actorProfileId: fixture.sourceAuthorId,
        postId: fixture.sourcePostId,
        origin: 'ACTIVITYPUB',
      });
      const executeUpdate = t.mock.method(
        temporalClient.workflow,
        'executeUpdateWithStart',
        async () => {
          throw new Error('Source deletion already owns revocation delivery');
        },
      );
      const revocation = new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      });
      assert.equal(await handleInboundQuoteRevocation(revocation), approved);
      assert.equal(executeUpdate.mock.calls.length, 0);
      assert.equal(
        (
          await db
            .select(postQuoteConsentColumns)
            .from(Posts)
            .where(eq(Posts.id, fixture.consentId))
            .then(firstOrThrow)
        ).status,
        PostQuoteConsentStatus.REVOKED,
      );
      assert.equal(
        await applyInboundQuoteRevocation({
          approvalUri: fixture.approvalUri.href,
          quoteUri: fixture.quoteUri.href,
          sourceAuthorActorUri: fixture.sourceActorUri.href,
          sourceUri: fixture.sourceUri.href,
        }),
        null,
      );
    });
  }

  test('pending 조회 뒤 Source 삭제가 commit되면 revoke Workflow는 추가 Update를 만들지 않는다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote();
    const executeUpdate = temporalClient.workflow.executeUpdateWithStart.bind(
      temporalClient.workflow,
    );
    t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async (...args: Parameters<typeof executeUpdate>) => {
        await deletePostPersisted({
          actorProfileId: fixture.sourceAuthorId,
          postId: fixture.sourcePostId,
          origin: 'ACTIVITYPUB',
        });
        return executeUpdate(...args);
      },
    );
    assert.equal(
      await handleInboundQuoteRevocation(
        new Delete({
          actor: fixture.sourceActorUri,
          object: fixture.approvalUri,
          target: fixture.sourceUri,
        }),
      ),
      false,
    );
    const handle = temporalClient.workflow.getHandle(
      `post-quote-revoke:${fixture.approvalUri.href}`,
    );
    await handle.result();
    const history = await handle.fetchHistory();
    assert.equal(
      (history.events ?? []).filter(
        (event) =>
          event.activityTaskScheduledEventAttributes?.activityType?.name ===
          'sendLocalPostConsentUpdateActivity',
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.REVOKED,
    );
  });

  test('위조된 Accept는 Quote 상태를 바꾸지 않고 유효한 Delete만 REVOKED로 전이한다', async () => {
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
    await handleInboundQuoteAccept({ accept: forgedAccept, context: createContext(), request });
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.APPROVED,
    );

    await handleInboundQuoteRevocation(
      new Delete({
        actor: fixture.sourceActorUri,
        object: fixture.approvalUri,
        target: fixture.sourceUri,
      }),
    );
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.REVOKED,
    );
  });

  test('target 없는 Delete는 적용하고 잘못된 target은 거부한다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const executeUpdate = t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async () => {
        return applyInboundQuoteRevocation({
          approvalUri: fixture.approvalUri.href,
          consentId: fixture.consentId,
          quoteUri: fixture.quoteUri.href,
          sourceAuthorActorUri: fixture.sourceActorUri.href,
          sourceUri: fixture.sourceUri.href,
        });
      },
    );
    const wrongTarget = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: new URL('https://remote-source.example/notes/wrong'),
    });
    assert.equal(await handleInboundQuoteRevocation(wrongTarget), true);
    assert.equal(executeUpdate.mock.calls.length, 0);
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
    });
    assert.equal(await handleInboundQuoteRevocation(revocation), true);
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.REVOKED,
    );
    await handleInboundQuoteRevocation(revocation);
    assert.equal(executeUpdate.mock.calls.length, 1);
  });

  test('중복 Delete는 같은 Quote command identity로 수렴하고 원본 forwarding을 호출하지 않는다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const commands: unknown[] = [];
    t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async (...args: Parameters<typeof temporalClient.workflow.executeUpdateWithStart>) => {
        const [, options] = args;
        commands.push(options.startWorkflowOperation.options.args?.[0]);
        await applyInboundQuoteRevocation({
          approvalUri: fixture.approvalUri.href,
          consentId: fixture.consentId,
          quoteUri: fixture.quoteUri.href,
          sourceAuthorActorUri: fixture.sourceActorUri.href,
          sourceUri: fixture.sourceUri.href,
        });
        return null;
      },
    );
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });
    await handleInboundQuoteRevocation(revocation);
    await handleInboundQuoteRevocation(revocation);
    assert.equal(commands.length, 1);
  });

  test('동시에 도착한 중복 Delete도 하나의 Quote Update Workflow identity로 수렴한다', async (t) => {
    const fixture = await createRemoteSourceAndPendingQuote({ approved: true });
    const workflowIds: string[] = [];
    const updateIds: string[] = [];
    const executeUpdate = temporalClient.workflow.executeUpdateWithStart.bind(
      temporalClient.workflow,
    );
    t.mock.method(
      temporalClient.workflow,
      'executeUpdateWithStart',
      async (...args: Parameters<typeof executeUpdate>) => {
        const [, options] = args;
        workflowIds.push(options.startWorkflowOperation.options.workflowId ?? '');
        updateIds.push(options.updateId ?? '');
        return executeUpdate(...args);
      },
    );
    const revocation = new Delete({
      actor: fixture.sourceActorUri,
      object: fixture.approvalUri,
      target: fixture.sourceUri,
    });
    await Promise.all([
      handleInboundQuoteRevocation(revocation),
      handleInboundQuoteRevocation(revocation),
    ]);
    assert.equal(workflowIds.length, 2);
    assert.equal(new Set(workflowIds).size, 1);
    assert.deepEqual(updateIds, ['command', 'command']);
    assert.equal(
      (
        await db
          .select(postQuoteConsentColumns)
          .from(Posts)
          .where(eq(Posts.id, fixture.consentId))
          .then(firstOrThrow)
      ).status,
      PostQuoteConsentStatus.REVOKED,
    );
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
  const approvalUri = `https://remote-source.example/quote-authorizations/${quotePost.id}`;
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
