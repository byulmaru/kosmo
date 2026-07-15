import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createFederation,
  generateCryptoKeyPair,
  MemoryKvStore,
  signRequest,
} from '@fedify/fedify';
import { CryptographicKey, Follow, Person } from '@fedify/vocab';
import { getDocumentLoader } from '@fedify/vocab-runtime';
import type { InboxContext } from '@fedify/fedify';

type FollowHandler = (context: InboxContext<void>, activity: Follow) => void | Promise<void>;

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

  test('unhandled Follow fails so the sender can retry delivery', async () => {
    const fixture = await createInboxFixture(throwUnhandledInboxActivity);
    const response = await fixture.federation.fetch(
      await fixture.createSignedFollowRequest(
        `/ap/actor/${localProfileId}/inbox`,
        'unhandled-follow',
      ),
      { contextData: undefined },
    );

    assert.equal(response.status, 500, await response.text());
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
  federation.setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox').on(Follow, onFollow);

  const createSignedFollowRequest = async (path: string, id: string): Promise<Request> => {
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

    return signRequest(request, remoteKeyPair.privateKey, remoteKeyUri);
  };

  return { createSignedFollowRequest, federation };
};

function throwUnhandledInboxActivity(): never {
  throw new Error('ActivityPub inbox handler is not implemented.');
}
