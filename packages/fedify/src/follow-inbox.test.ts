import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createFederation, MemoryKvStore } from '@fedify/fedify';
import { Accept, Follow, Person, Reject, Undo } from '@fedify/vocab';
import { registerFollowInboxListeners } from './follow-inbox';

describe('Fedify follow inbox routes', () => {
  test('claims personal and shared inbox POSTs before the application fallback', async () => {
    const federation = createFederation<void>({ kv: new MemoryKvStore() });
    federation
      .setActorDispatcher('/ap/actor/{identifier}', (context, identifier) =>
        identifier === 'local-profile' ? new Person({ id: context.getActorUri(identifier) }) : null,
      )
      .setKeyPairsDispatcher(() => []);
    registerFollowInboxListeners(federation, {
      onAccept: () => undefined,
      onFollow: () => undefined,
      onReject: () => undefined,
      onUndo: () => undefined,
    });
    let fallbackCalls = 0;

    for (const path of ['/ap/actor/local-profile/inbox', '/inbox']) {
      const response = await federation.fetch(
        new Request(new URL(path, 'https://kos.moe'), {
          body: JSON.stringify({
            '@context': 'https://www.w3.org/ns/activitystreams',
            actor: 'https://remote.example/users/alice',
            object: 'https://kos.moe/ap/actor/local-profile',
            type: 'Follow',
          }),
          headers: { 'content-type': 'application/activity+json' },
          method: 'POST',
        }),
        {
          contextData: undefined,
          onNotFound: () => {
            fallbackCalls += 1;
            return new Response('application fallback', { status: 418 });
          },
        },
      );

      assert.notEqual(response.status, 418);
    }
    assert.equal(fallbackCalls, 0);
  });

  test('keeps unsupported follow collections and outbox paths in the 404 fallback', async () => {
    const federation = createFederation<void>({ kv: new MemoryKvStore() });
    registerFollowInboxListeners(federation, {
      onAccept: () => undefined,
      onFollow: () => undefined,
      onReject: () => undefined,
      onUndo: () => undefined,
    });
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

  test('registers only the four follow protocol activity types', () => {
    const registered: Array<typeof Follow | typeof Undo | typeof Accept | typeof Reject> = [];
    const setters = {
      on(type: typeof Follow | typeof Undo | typeof Accept | typeof Reject) {
        registered.push(type);
        return setters;
      },
    };
    const federation = {
      setInboxListeners(personalPath: string, sharedPath: string) {
        assert.equal(personalPath, '/ap/actor/{identifier}/inbox');
        assert.equal(sharedPath, '/inbox');
        return setters;
      },
    };

    registerFollowInboxListeners(
      federation as unknown as Parameters<typeof registerFollowInboxListeners>[0],
      {
        onAccept: () => undefined,
        onFollow: () => undefined,
        onReject: () => undefined,
        onUndo: () => undefined,
      },
    );

    assert.deepEqual(registered, [Follow, Undo, Accept, Reject]);
  });
});
