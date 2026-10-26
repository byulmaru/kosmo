import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
} from '@fedify/fedify';
import { CryptographicKey, EmojiReact, Follow, Like, Person } from '@fedify/vocab';
import { FetchError, getDocumentLoader } from '@fedify/vocab-runtime';
import { ValidationError } from '@kosmo/core/error';
import {
  hasInboundErrorBeenObserved,
  isExternalInboundError,
  observeInbound,
  observeInboxAuthenticationRejection,
  setInboundObservabilityReporter,
  withInboundObservability,
} from './inbound-observability';
import type { InboxContext } from '@fedify/fedify';

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

  test('captures rejected inbox authentication with bounded Fedify diagnostics', async () => {
    const captures: Array<{
      context: { extra?: Record<string, string>; tags: Record<string, string> };
      error: unknown;
    }> = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: () => undefined,
    });

    try {
      const fixture = await createInboxFixture(async () => undefined);
      const acceptedRequest = await fixture.createSignedFollowRequest('/inbox', 'accepted');
      const acceptedResponse = await fixture.federation.fetch(acceptedRequest, {
        contextData: undefined,
      });
      assert.equal(acceptedResponse.status, 202);
      assert.equal(captures.length, 0);

      const rejectedRequest = await fixture.createInvalidSignatureFollowRequest(
        '/inbox',
        'rejected-private-activity',
      );
      const requestBody = await rejectedRequest.clone().text();
      const signature = rejectedRequest.headers.get('signature');
      const rejectedResponse = await fixture.federation.fetch(rejectedRequest, {
        contextData: undefined,
      });

      assert.equal(rejectedResponse.status, 401);
      assert.equal(captures.length, 1);
      assert.deepEqual(captures[0]?.context.tags, {
        activity_type: 'Follow',
        handler: 'listener',
        outcome: 'rejected',
        phase: 'authentication',
        reason_code: 'inbox_authentication_verification_failed',
      });
      assert.equal(
        captures[0]?.context.extra?.http_attempt_reason_types,
        'signatureVerificationFailed',
      );
      assert.equal(captures[0]?.context.extra?.http_check_failure_types, 'invalidSignature');
      assert.equal(
        captures[0]?.context.extra?.http_signature_specs,
        'draft-cavage-http-signatures-12',
      );
      assert.equal(captures[0]?.context.extra?.claimed_actor_origin, remoteActorUri.origin);
      assert.equal(captures[0]?.context.extra?.claimed_activity_origin, remoteActorUri.origin);

      const observed = JSON.stringify(captures);
      assert.equal(observed.includes(requestBody), false);
      assert.equal(signature ? observed.includes(signature) : false, false);
      assert.equal(observed.includes('rejected-private-activity'), false);
      assert.equal(
        (captures[0]?.error as Error).message,
        'inbox_authentication_verification_failed',
      );
    } finally {
      restore();
    }
  });

  test('captures key-fetch status and keeps authentication failures as 401', async () => {
    const captures: Array<{
      context: { extra?: Record<string, string> };
      error: unknown;
    }> = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: () => undefined,
    });

    try {
      const fixture = await createInboxFixture(async () => undefined, { keyFetchStatus: 404 });
      const response = await fixture.federation.fetch(
        await fixture.createSignedFollowRequest('/inbox', 'key-fetch-failure'),
        { contextData: undefined },
      );

      assert.equal(response.status, 401);
      assert.equal(captures.length, 1);
      assert.equal(captures[0]?.context.extra?.http_check_failure_types, 'keyFetchError');
      assert.equal(captures[0]?.context.extra?.remote_key_http_statuses, '404');
    } finally {
      restore();
    }
  });

  test('captures a production federation authentication rejection once', async () => {
    const captures: Array<{
      context: { extra?: Record<string, string>; tags: Record<string, string> };
      error: unknown;
    }> = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error, context) => captures.push({ context, error }),
      log: () => undefined,
    });

    try {
      const { federation: productionFederation } = await import('./federation');
      const activity = new Follow({
        actor: remoteActorUri,
        id: new URL('/activities/production-unsigned', remoteActorUri),
        object: new URL(`/ap/actor/${localProfileId}`, 'https://kos.moe'),
      });
      const request = new Request(new URL('/inbox', 'https://kos.moe'), {
        body: JSON.stringify(await activity.toJsonLd({ contextLoader: getDocumentLoader() })),
        headers: { 'content-type': 'application/activity+json' },
        method: 'POST',
      });
      const response = await productionFederation.fetch(request, { contextData: undefined });

      assert.equal(response.status, 401);
      assert.equal(captures.length, 1);
      assert.equal(
        captures[0]?.context.tags.reason_code,
        'inbox_authentication_verification_failed',
      );
      assert.equal(captures[0]?.context.extra?.http_attempt_reason_types, 'noSignature');
      assert.equal(captures[0]?.context.extra?.claimed_actor_origin, remoteActorUri.origin);
    } finally {
      restore();
    }
  });

  test('does not capture non-authentication inbox rejections and reporter errors preserve 401', async () => {
    const captures: unknown[] = [];
    const restore = setInboundObservabilityReporter({
      captureException: (error) => captures.push(error),
      log: () => undefined,
    });

    try {
      const fixture = await createInboxFixture(async () => undefined);
      const malformedJsonResponse = await fixture.federation.fetch(
        new Request(new URL('/inbox', 'https://kos.moe'), {
          body: '{',
          headers: { 'content-type': 'application/activity+json' },
          method: 'POST',
        }),
        { contextData: undefined },
      );
      assert.equal(malformedJsonResponse.status, 400);
      assert.equal(captures.length, 0);
    } finally {
      restore();
    }

    const restoreThrowingReporter = setInboundObservabilityReporter({
      captureException: () => {
        throw new Error('Sentry unavailable');
      },
      log: () => {
        throw new Error('logger unavailable');
      },
    });
    try {
      const fixture = await createInboxFixture(async () => undefined);
      const response = await fixture.federation.fetch(
        await fixture.createInvalidSignatureFollowRequest('/inbox', 'reporter-failure'),
        { contextData: undefined },
      );
      assert.equal(response.status, 401);
    } finally {
      restoreThrowingReporter();
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

const createInboxFixture = async (
  onFollow: FollowHandler,
  options: { keyFetchStatus?: number } = {},
) => {
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

    if (options.keyFetchStatus != null && url === remoteKeyUri.href) {
      throw new FetchError(
        url,
        'Remote key fetch failed',
        new Response(null, { status: options.keyFetchStatus }),
      );
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
    .onRequestFinished(observeInboxAuthenticationRejection)
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
