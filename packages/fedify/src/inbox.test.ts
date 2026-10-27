import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
  verifyRequest,
} from '@fedify/fedify';
import { CryptographicKey, EmojiReact, Follow, Like, Person } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import { ValidationError } from '@kosmo/core/error';
import {
  hasInboundErrorBeenObserved,
  isExternalInboundError,
  observeInbound,
  setInboundObservabilityReporter,
  withInboundObservability,
} from './inbound-observability';
import {
  createLocalInstanceApplication,
  localInstanceActorIdentifier,
} from './local-instance-actor';
import { configureFedifyInboxLogging } from './logging';
import type { InboxContext } from '@fedify/fedify';
import type { SentryNamespace } from '@logtape/sentry';

type FollowHandler = (context: InboxContext<void>, activity: Follow) => void | Promise<void>;
type ReactionHandler = (
  context: InboxContext<void>,
  activity: Like | EmojiReact,
) => void | Promise<void>;

const localProfileId = '019f6f67-1111-7777-8888-123456789abc';
const remoteActorUri = new URL('https://remote.example/users/alice');
const remoteKeyUri = new URL('#main-key', remoteActorUri);

describe('Fedify inbox routes', () => {
  test('signed Follow reaches the handler through personal and shared inboxes', async () => {
    const calls: Array<{ activity: Follow; recipient: string | null }> = [];
    const fixture = await createInboxFixture((context, activity) => {
      calls.push({ activity, recipient: context.recipient });
    });

    const personalResponse = await fixture.federation.fetch(
      await fixture.createSignedFollowRequest(
        `/ap/actor/${localProfileId}/inbox`,
        'personal-follow',
      ),
      { contextData: undefined },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedFollowRequest('/inbox', 'shared-follow'),
      { contextData: undefined },
    );

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.deepEqual(
      calls.map(({ activity, recipient }) => ({ id: activity.id?.href, recipient })),
      [
        { id: 'https://remote.example/activities/personal-follow', recipient: localProfileId },
        { id: 'https://remote.example/activities/shared-follow', recipient: null },
      ],
    );
  });

  test('uses the Local Instance actor key for a shared inbox AUTHORIZED_FETCH document request', async (t) => {
    const serverActorUri = new URL('/ap/actor/~instance', 'https://kos.moe');
    const serverKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const remoteActorUri = new URL(`https://remote.example/users/${crypto.randomUUID()}`);
    const remoteKeyUri = new URL('#main-key', remoteActorUri);
    const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    const remoteKey = new CryptographicKey({
      id: remoteKeyUri,
      owner: remoteActorUri,
      publicKey: remoteKeyPair.publicKey,
    });
    const remoteActorDocument = await new Person({
      id: remoteActorUri,
      publicKey: remoteKey,
    }).toJsonLd({ format: 'expand' });
    const contextLoader = getDocumentLoader();
    const delivered: Array<{
      actor: string | undefined;
      id: string | undefined;
      recipient: string | null;
    }> = [];
    const federation = createFederation<void>({
      allowPrivateAddress: true,
      kv: new MemoryKvStore(),
      origin: 'https://kos.moe',
    });
    federation
      .setActorDispatcher('/ap/actor/{identifier}', (context, identifier) =>
        identifier === localInstanceActorIdentifier
          ? createLocalInstanceApplication(context, serverKeyPair)
          : null,
      )
      .setKeyPairsDispatcher((_context, identifier) =>
        identifier === localInstanceActorIdentifier ? [serverKeyPair] : [],
      );
    federation
      .setOutboxDispatcher('/ap/actor/{identifier}/outbox', () => ({ items: [] }))
      .setCounter((context, identifier) =>
        context.host === new URL(context.canonicalOrigin).host &&
        identifier === localInstanceActorIdentifier
          ? 0
          : null,
      );
    federation
      .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
      .setSharedKeyDispatcher((context) =>
        context.host === new URL(context.canonicalOrigin).host
          ? { identifier: localInstanceActorIdentifier }
          : null,
      )
      .on(Follow, (context, activity) => {
        delivered.push({
          actor: activity.actorId?.href,
          id: activity.id?.href,
          recipient: context.recipient,
        });
      });

    const actorResponse = await federation.fetch(
      new Request(serverActorUri, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(actorResponse.status, 200);
    const serverActorDocument = await actorResponse.json();
    const actor = serverActorDocument as {
      id?: string;
      inbox?: string;
      outbox?: string;
      publicKey?: { id?: string; owner?: string; publicKeyPem?: string };
      type?: string;
    };
    assert.equal(actor.id, serverActorUri.href);
    assert.equal(actor.type, 'Application');
    assert.equal(actor.inbox, 'https://kos.moe/inbox');
    assert.equal(actor.publicKey?.id, `${serverActorUri.href}#main-key`);
    assert.equal(actor.publicKey?.owner, serverActorUri.href);
    assert.ok(actor.publicKey?.publicKeyPem);
    const serializedActor = JSON.stringify(serverActorDocument).replaceAll('\\n', '');
    assert.equal(serializedActor.includes('privateKey'), false);
    const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', serverKeyPair.privateKey);
    assert.equal(serializedActor.includes(Buffer.from(privateKeyPkcs8).toString('base64')), false);
    assert.equal(actor.outbox, 'https://kos.moe/ap/actor/~instance/outbox');
    const outboxResponse = await federation.fetch(
      new Request(actor.outbox!, { headers: { accept: 'application/activity+json' } }),
      { contextData: undefined },
    );
    assert.equal(outboxResponse.status, 200);
    const outbox = (await outboxResponse.json()) as {
      id?: string;
      orderedItems?: unknown[];
      totalItems?: number;
      type?: string;
    };
    assert.equal(outbox.id, actor.outbox);
    assert.equal(outbox.type, 'OrderedCollection');
    assert.equal(outbox.totalItems, 0);
    assert.deepEqual(outbox.orderedItems ?? [], []);
    const serverKeyId = new URL('#main-key', serverActorUri);
    const remoteFetchAttempts: Array<{ keyId: string | null; signed: boolean; url: string }> = [];

    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method !== 'GET' || new URL(request.url).origin !== remoteActorUri.origin) {
        return new Response(null, { status: 401 });
      }

      const key = await verifyRequest(request, {
        contextLoader,
        documentLoader: async (url) => ({
          contextUrl: null,
          document: serverActorDocument,
          documentUrl: url,
        }),
      });
      remoteFetchAttempts.push({
        keyId: key?.id?.href ?? null,
        signed: request.headers.has('signature') || request.headers.has('signature-input'),
        url: request.url,
      });
      if (key?.id?.href !== serverKeyId.href) {
        return new Response(null, { status: 401 });
      }

      return new Response(JSON.stringify(remoteActorDocument), {
        headers: { 'content-type': 'application/activity+json' },
      });
    });

    const follow = new Follow({
      actor: remoteActorUri,
      id: new URL('/activities/shared-authorized-fetch', remoteActorUri),
      object: serverActorUri,
    });
    const unsignedRequest = new Request('https://kos.moe/inbox', {
      body: JSON.stringify(await follow.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });
    const response = await federation.fetch(
      await signRequest(unsignedRequest, remoteKeyPair.privateKey, remoteKeyUri),
      { contextData: undefined },
    );

    assert.equal(
      response.status,
      202,
      JSON.stringify({ attempts: remoteFetchAttempts, body: await response.text() }),
    );
    assert.ok(remoteFetchAttempts.length > 0, JSON.stringify(remoteFetchAttempts));
    assert.ok(
      remoteFetchAttempts.every(({ keyId, signed }) => signed && keyId === serverKeyId.href),
      JSON.stringify(remoteFetchAttempts),
    );
    assert.deepEqual(delivered, [
      {
        actor: remoteActorUri.href,
        id: follow.id?.href,
        recipient: null,
      },
    ]);
  });

  test('signed Like and EmojiReact reach typed handlers through personal and shared inboxes', async () => {
    const calls: Array<{
      audienceSize: number;
      id: string | undefined;
      recipient: string | null;
      type: string;
    }> = [];
    const fixture = await createReactionInboxFixture((context, activity) => {
      calls.push({
        audienceSize:
          activity.toIds.length +
          activity.btoIds.length +
          activity.ccIds.length +
          activity.bccIds.length,
        id: activity.id?.href,
        recipient: context.recipient,
        type: activity instanceof Like ? 'Like' : 'EmojiReact',
      });
    });

    const personalResponse = await fixture.federation.fetch(
      await fixture.createSignedReactionRequest(
        `/ap/actor/${localProfileId}/inbox`,
        'personal-like',
        'Like',
        false,
      ),
      { contextData: undefined },
    );
    const sharedResponse = await fixture.federation.fetch(
      await fixture.createSignedReactionRequest('/inbox', 'shared-emoji', 'EmojiReact'),
      { contextData: undefined },
    );

    assert.equal(personalResponse.status, 202, await personalResponse.text());
    assert.equal(sharedResponse.status, 202, await sharedResponse.text());
    assert.deepEqual(calls, [
      {
        audienceSize: 0,
        id: 'https://remote.example/activities/personal-like',
        recipient: localProfileId,
        type: 'Like',
      },
      {
        audienceSize: 1,
        id: 'https://remote.example/activities/shared-emoji',
        recipient: null,
        type: 'EmojiReact',
      },
    ]);
  });

  test('keeps unsupported follow collections and outbox paths in the 404 fallback', async () => {
    const federation = createFederation<void>({ kv: new MemoryKvStore() });
    federation
      .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
      .on(Follow, () => undefined);
    const unsupportedPaths = [
      '/ap/actor/local-profile/outbox',
      '/ap/actor/local-profile/followers',
      '/ap/actor/local-profile/following',
      '/outbox',
    ];

    for (const path of unsupportedPaths) {
      const response = await federation.fetch(new Request(new URL(path, 'https://kos.moe')), {
        contextData: undefined,
      });

      assert.equal(response.status, 404);
    }
  });

  test('rejects a permanent listener validation error without retrying it', async () => {
    const captures: unknown[] = [];
    const logs: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });

    try {
      const fixture = await createInboxFixture(async () => {
        throw new ValidationError('Activity identity conflicts with its first observation');
      });
      const response = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest('/inbox', 'invalid-shared'),
        { contextData: undefined },
      );

      assert.equal(response.status, 202, await response.text());
      assert.equal(captures.length, 0);
      assert.deepEqual(logs, [
        {
          activityType: 'Follow',
          activityOrigin: 'https://remote.example',
          actorOrigin: 'https://remote.example',
          handler: 'follow',
          objectOrigin: 'https://kos.moe',
          objectUri: 'https://kos.moe/ap/actor/019f6f67-1111-7777-8888-123456789abc',
          outcome: 'rejected',
          phase: 'validation',
          reasonCode: 'invalid_listener_input',
        },
      ]);
    } finally {
      restore();
    }
  });

  test('keeps listener errors observable without changing personal/shared inbox responses', async () => {
    const captures: unknown[] = [];
    const logs: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: (observation) => logs.push(observation),
    });

    try {
      const error = Object.assign(new SyntaxError('internal projection failure'), {
        code: 'ECONNREFUSED',
      });
      const fixture = await createInboxFixture(async () => {
        throw error;
      });
      const personalResponse = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest(
          `/ap/actor/${localProfileId}/inbox`,
          'internal-personal',
        ),
        { contextData: undefined },
      );
      const sharedResponse = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest('/inbox', 'internal-shared'),
        { contextData: undefined },
      );

      assert.equal(personalResponse.status, 500);
      assert.equal(sharedResponse.status, 500);
      assert.equal(captures.length, 2);
      assert.equal(logs.length, 2);
      assert.deepEqual((captures[0] as { context: { tags: object } }).context.tags, {
        activity_type: 'Follow',
        handler: 'follow',
        outcome: 'internal_failure',
        phase: 'listener',
        reason_code: 'unexpected_listener_error',
      });
    } finally {
      restore();
    }
  });

  test('rejects an invalid inbox signature with 401 and logs its native reason and context', async (t) => {
    const output: string[] = [];
    const reporterCaptures: unknown[] = [];
    const sentryIssues: Array<{ message: string; context: unknown }> = [];
    const sentryLogs: Array<{ message: string; attributes: Record<string, unknown> }> = [];
    const sentry = {
      captureMessage: (message, context) => {
        sentryIssues.push({ message: String(message), context });
        return 'event-id';
      },
      captureException: () => 'event-id',
      getActiveSpan: () => undefined,
      getClient: () => ({ getOptions: () => ({ enableLogs: true }) }),
      getIsolationScope: () => undefined,
      logger: {
        error: (message, attributes) => sentryLogs.push({ message: String(message), attributes }),
      },
    } satisfies SentryNamespace;
    const capture = (...args: unknown[]) => output.push(String(args[0]));
    t.mock.method(console, 'debug', capture);
    t.mock.method(console, 'info', capture);
    t.mock.method(console, 'warn', capture);
    t.mock.method(console, 'error', capture);
    const restoreReporter = setInboundObservabilityReporter({
      captureException: (error) => reporterCaptures.push(error),
      log: () => undefined,
    });
    configureFedifyInboxLogging(sentry);

    try {
      const fixture = await createInboxFixture(async () => undefined);
      const response = await fixture.federation.fetch(
        await fixture.createInvalidSignatureFollowRequest('/inbox', 'invalid-signature'),
        { contextData: undefined },
      );

      assert.equal(response.status, 401);
      assert.equal(reporterCaptures.length, 0);
      const record = output
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .find(
          ({ logger: category, message }) =>
            category === 'fedify.federation.inbox' &&
            message === "Failed to verify the request's HTTP Signatures.",
        );
      assert.equal(record?.level, 'ERROR');
      assert.equal(record?.logger, 'fedify.federation.inbox');
      assert.deepEqual(record?.properties, {
        keyId: remoteKeyUri.href,
        recipient: null,
        reason: 'invalidSignature',
      });
      assert.deepEqual(
        sentryLogs.map(({ message, attributes }) => ({
          keyId: attributes.keyId,
          message,
          reason: attributes.reason,
          recipient: attributes.recipient,
        })),
        [
          {
            keyId: remoteKeyUri.href,
            message: "Failed to verify the request's HTTP Signatures.",
            reason: 'invalidSignature',
            recipient: null,
          },
        ],
      );
      assert.deepEqual(
        sentryIssues.map(({ message, context }) => ({
          level: (context as { level: string }).level,
          message,
        })),
        [{ level: 'error', message: "Failed to verify the request's HTTP Signatures." }],
      );
    } finally {
      restoreReporter();
    }
  });

  test('does not capture a remote listener failure', async () => {
    const captures: unknown[] = [];
    const logs: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: (observation) => logs.push(observation),
    });

    try {
      const error = new Error('remote timeout');
      error.name = 'FetchError';
      const fixture = await createInboxFixture(async () => {
        throw error;
      });
      const response = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest('/inbox', 'external-shared'),
        { contextData: undefined },
      );

      assert.equal(response.status, 500);
      assert.equal(captures.length, 0);
      assert.equal(logs.length, 1);
      assert.equal((logs[0] as { outcome: string }).outcome, 'external_failure');
    } finally {
      restore();
    }
  });

  test('normalizes primitive listener throws and captures once at the inbox boundary', async () => {
    const captures: unknown[] = [];
    const logs: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: (observation) => logs.push(observation),
    });

    try {
      const fixture = await createInboxFixture(async () => {
        throw 'primitive listener failure';
      });
      const response = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest('/inbox', 'primitive-shared'),
        { contextData: undefined },
      );

      assert.equal(response.status, 500);
      assert.equal(captures.length, 1);
      assert.equal(logs.length, 1);
      assert.equal((captures[0] as { error: unknown }).error instanceof Error, true);
      assert.equal(
        (captures[0] as { error: Error }).error.message,
        'ActivityPub inbound listener threw a non-Error value',
      );
    } finally {
      restore();
    }
  });
});

const createInboxFixture = async (onFollow: FollowHandler) => {
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKey = new CryptographicKey({
    id: remoteKeyUri,
    owner: remoteActorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({
    id: remoteActorUri,
    publicKey: remoteKey,
  });
  const remoteActorDocument = await remoteActor.toJsonLd({ format: 'expand' });
  const remoteKeyDocument = await remoteKey.toJsonLd({ format: 'expand' });
  const documentLoader = async (url: string) => {
    if (url !== remoteActorUri.href && url !== remoteKeyUri.href) {
      throw new Error(`Unexpected document URL: ${url}`);
    }

    return {
      contextUrl: null,
      document: url === remoteKeyUri.href ? remoteKeyDocument : remoteActorDocument,
      documentUrl: url,
    };
  };
  const kv = new MemoryKvStore();
  const contextLoader = getDocumentLoader();
  const federation = createFederation<void>({
    authenticatedDocumentLoaderFactory: () => documentLoader,
    contextLoaderFactory: () => contextLoader,
    documentLoaderFactory: () => documentLoader,
    kv,
  });
  const localKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  federation
    .setActorDispatcher('/ap/actor/{identifier}', (context, identifier) =>
      identifier === localProfileId ? new Person({ id: context.getActorUri(identifier) }) : null,
    )
    .setKeyPairsDispatcher(() => [localKeyPair]);
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Follow, withInboundObservability('follow', onFollow))
    .onError((_context, error) => {
      if (hasInboundErrorBeenObserved(error)) {
        return;
      }

      const external = error instanceof SyntaxError || isExternalInboundError(error);
      observeInbound({
        activityType: 'Unknown',
        error,
        handler: 'listener',
        outcome: external ? 'external_failure' : 'internal_failure',
        phase: 'listener',
        reasonCode: external ? 'external_listener_error' : 'unexpected_listener_error',
      });
    });

  const createFollowRequest = async (path: string, id: string): Promise<Request> => {
    const activity = new Follow({
      actor: remoteActorUri,
      id: new URL(`/activities/${id}`, remoteActorUri),
      object: new URL(`/ap/actor/${localProfileId}`, 'https://kos.moe'),
    });
    const request = new Request(new URL(path, 'https://kos.moe'), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });
    return request;
  };

  const createSignedFollowRequest = async (path: string, id: string): Promise<Request> =>
    signRequest(await createFollowRequest(path, id), remoteKeyPair.privateKey, remoteKeyUri);

  const createInvalidSignatureFollowRequest = async (
    path: string,
    id: string,
  ): Promise<Request> => {
    const otherKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
    return signRequest(await createFollowRequest(path, id), otherKeyPair.privateKey, remoteKeyUri);
  };

  return { createInvalidSignatureFollowRequest, createSignedFollowRequest, federation };
};

const createReactionInboxFixture = async (onReaction: ReactionHandler) => {
  const remoteKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  const remoteKey = new CryptographicKey({
    id: remoteKeyUri,
    owner: remoteActorUri,
    publicKey: remoteKeyPair.publicKey,
  });
  const remoteActor = new Person({
    id: remoteActorUri,
    publicKey: remoteKey,
  });
  const remoteActorDocument = await remoteActor.toJsonLd({ format: 'expand' });
  const remoteKeyDocument = await remoteKey.toJsonLd({ format: 'expand' });
  const documentLoader = async (url: string) => {
    if (url !== remoteActorUri.href && url !== remoteKeyUri.href) {
      throw new Error(`Unexpected document URL: ${url}`);
    }

    return {
      contextUrl: null,
      document: url === remoteKeyUri.href ? remoteKeyDocument : remoteActorDocument,
      documentUrl: url,
    };
  };
  const contextLoader = getDocumentLoader();
  const federation = createFederation<void>({
    authenticatedDocumentLoaderFactory: () => documentLoader,
    contextLoaderFactory: () => contextLoader,
    documentLoaderFactory: () => documentLoader,
    kv: new MemoryKvStore(),
  });
  const localKeyPair = await generateCryptoKeyPair('RSASSA-PKCS1-v1_5');
  federation
    .setActorDispatcher('/ap/actor/{identifier}', (context, identifier) =>
      identifier === localProfileId ? new Person({ id: context.getActorUri(identifier) }) : null,
    )
    .setKeyPairsDispatcher(() => [localKeyPair]);
  federation
    .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
    .on(Like, (context, activity) => onReaction(context, activity))
    .on(EmojiReact, (context, activity) => onReaction(context, activity));

  const createSignedReactionRequest = async (
    path: string,
    id: string,
    type: 'EmojiReact' | 'Like',
    includeAudience = true,
  ): Promise<Request> => {
    const Activity = type === 'Like' ? Like : EmojiReact;
    const localActorUri = new URL(`/ap/actor/${localProfileId}`, 'https://kos.moe');
    const activity = new Activity({
      actor: remoteActorUri,
      content: type === 'Like' ? '❤️' : '🎉',
      id: new URL(`/activities/${id}`, remoteActorUri),
      object: new URL('/ap/note/019f6f67-2222-7777-8888-123456789abc', 'https://kos.moe'),
      ...(includeAudience ? { to: localActorUri } : {}),
    });
    const request = new Request(new URL(path, 'https://kos.moe'), {
      body: JSON.stringify(await activity.toJsonLd({ contextLoader })),
      headers: { 'content-type': 'application/activity+json' },
      method: 'POST',
    });

    return signRequest(request, remoteKeyPair.privateKey, remoteKeyUri);
  };

  return { createSignedReactionRequest, federation };
};
