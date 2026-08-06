import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as PostContentWarningRevealContextModule from './PostContentWarningRevealContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  selectedProfileId: 'profile-a' as string | null,
  sessionId: 'session-a' as string | null,
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
});

let createPostContentWarningRevealStore: typeof PostContentWarningRevealContextModule.createPostContentWarningRevealStore;
let PostContentWarningRevealProvider: typeof PostContentWarningRevealContextModule.PostContentWarningRevealProvider;
let usePostContentWarningReveal: typeof PostContentWarningRevealContextModule.usePostContentWarningReveal;
let renderer: ReactTestRenderer | null = null;
let probe: { revealed: boolean; toggle: () => void } | null = null;

before(async () => {
  ({
    createPostContentWarningRevealStore,
    PostContentWarningRevealProvider,
    usePostContentWarningReveal,
  } = await import('./PostContentWarningRevealContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  probe = null;
  session.selectedProfileId = 'profile-a';
  session.sessionId = 'session-a';
});

function Probe() {
  probe = usePostContentWarningReveal('post-a');
  return null;
}

function renderProvider() {
  return createElement(PostContentWarningRevealProvider, null, createElement(Probe));
}

describe('PostContentWarningRevealStore', () => {
  it('shares reveal state by Post identity and isolates listeners for different Posts', () => {
    const store = createPostContentWarningRevealStore();
    let postANotifications = 0;
    let postBNotifications = 0;
    const unsubscribeA = store.subscribe('post-a', () => {
      postANotifications += 1;
    });
    const unsubscribeB = store.subscribe('post-b', () => {
      postBNotifications += 1;
    });

    assert.equal(store.get('post-a'), false);
    assert.equal(store.get('post-b'), false);

    store.set('post-a', true);

    assert.equal(store.get('post-a'), true);
    assert.equal(store.get('post-b'), false);
    assert.equal(postANotifications, 1);
    assert.equal(postBNotifications, 0);

    store.set('post-a', true);
    assert.equal(postANotifications, 1);

    store.set('post-a', false);
    assert.equal(store.get('post-a'), false);
    assert.equal(postANotifications, 2);
    assert.equal(postBNotifications, 0);

    unsubscribeA();
    store.set('post-b', true);
    assert.equal(postANotifications, 2);
    assert.equal(postBNotifications, 1);
    unsubscribeB();
  });
});

describe('PostContentWarningRevealProvider', () => {
  it('shares Post.id reveal state within one selected Profile/session lifecycle and resets on transition', async () => {
    await act(async () => {
      renderer = create(renderProvider());
    });
    assert.ok(probe);

    await act(async () => probe?.toggle());
    assert.equal(probe?.revealed, true);

    session.selectedProfileId = 'profile-b';
    await act(async () => {
      renderer?.update(renderProvider());
    });
    assert.equal(probe?.revealed, false);

    await act(async () => probe?.toggle());
    assert.equal(probe?.revealed, true);

    session.sessionId = 'session-b';
    await act(async () => {
      renderer?.update(renderProvider());
    });
    assert.equal(probe?.revealed, false);
  });
});
