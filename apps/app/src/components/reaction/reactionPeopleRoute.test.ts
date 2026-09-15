import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  bindReactionPeopleReturnEntry,
  clearReactionPeopleReturnState,
  consumeReactionPeopleReturnToOrigin,
  getReactionPeopleHref,
  hasReactionPeopleReturnToOrigin,
  rememberReactionPeopleReturnFocus,
  resolveReactionPeopleType,
  restoreReactionPeopleReturnFocus,
} from './reactionPeopleRoute';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigationListeners = new Set<(event: unknown) => void>();
const transitionEndListeners = new Set<(event: unknown) => void>();
const routerReplacements: string[] = [];
let renderer: ReactTestRenderer | null = null;
let route: ComponentType | null = null;
let reactionPeopleScreenProps: { onBack: () => void } | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ profileHandle: '@writer', postId: 'post-1' }),
  useNavigation: () => ({
    addListener: (event: string, listener: (payload: unknown) => void) => {
      const listeners = event === 'beforeRemove' ? navigationListeners : transitionEndListeners;
      assert.ok(event === 'beforeRemove' || event === 'transitionEnd');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  }),
  useRouter: () => ({
    back: () => {
      for (const listener of navigationListeners) {
        listener({ data: { action: { type: 'GO_BACK' } }, type: 'beforeRemove' });
      }
    },
    canGoBack: () => true,
    replace: (href: string) => routerReplacements.push(href),
    setParams: () => undefined,
  }),
});
mockModule('react-relay', {
  graphql: () => 'ReactionPeopleRouteQuery',
  useLazyLoadQuery: () => ({
    node: {
      __typename: 'Post',
      id: 'post-1',
      state: 'PUBLISHED',
      profile: { relativeHandle: '@writer' },
      content: { id: 'content-1' },
      replyParent: null,
      repostSource: null,
      reactionCounts: [{ count: 1, type: '❤️' }],
    },
  }),
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: unknown }) => children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/reaction/ReactionPeopleScreen', {
  ReactionPeopleHeader: () => createElement('ReactionPeopleHeader'),
  ReactionPeopleScreen: (props: { onBack: () => void }) => {
    reactionPeopleScreenProps = props;
    return createElement('ReactionPeopleScreen');
  },
});
mockModule('@/components/ui/StateView', {
  StateView: () => createElement('StateView'),
});

before(async () => {
  route = (await import('../../app/(tabs)/(post)/[profileHandle]/[postId]/reactions')).default;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  navigationListeners.clear();
  transitionEndListeners.clear();
  reactionPeopleScreenProps = null;
  routerReplacements.length = 0;
  clearReactionPeopleReturnState();
});

async function renderRoute() {
  const Route = route;
  assert.ok(Route);
  await act(async () => {
    renderer = create(createElement(Route));
  });
}

describe('reaction people route helpers', () => {
  it('keeps a requested positive Type and falls back in server order', () => {
    const entries = [
      { count: 0, type: '🥹' },
      { count: 2, type: '❤️' },
      { count: 1, type: '🎉' },
    ];

    assert.equal(resolveReactionPeopleType(entries, '🎉'), '🎉');
    assert.equal(resolveReactionPeopleType(entries, '👀'), '❤️');
    assert.equal(resolveReactionPeopleType(entries), '❤️');
  });

  it('returns no Type when there are no positive counts', () => {
    assert.equal(resolveReactionPeopleType([{ count: 0, type: '❤️' }], '❤️'), null);
  });

  it('encodes an optional Type in the canonical People URL', () => {
    assert.equal(
      getReactionPeopleHref('@writer', 'post-1', '❤️ & joy'),
      '/@writer/post-1/reactions?type=%E2%9D%A4%EF%B8%8F%20%26%20joy',
    );
    assert.equal(getReactionPeopleHref('@writer', 'post-1'), '/@writer/post-1/reactions');
  });

  it('remembers an in-app origin independently from browser focus support', () => {
    rememberReactionPeopleReturnFocus('/@writer/post-1/reactions');
    assert.equal(hasReactionPeopleReturnToOrigin(), true);
    assert.equal(consumeReactionPeopleReturnToOrigin(), true);
    assert.equal(hasReactionPeopleReturnToOrigin(), false);
    assert.equal(consumeReactionPeopleReturnToOrigin(), false);
  });

  it('does not treat the React Native window alias as browser history', () => {
    const global = globalThis as unknown as { window?: unknown };
    const previousWindow = global.window;
    global.window = globalThis;

    try {
      rememberReactionPeopleReturnFocus('/@writer/post-1/reactions');
      assert.equal(bindReactionPeopleReturnEntry(), false);
      assert.equal(hasReactionPeopleReturnToOrigin(), true);
    } finally {
      global.window = previousWindow;
    }
  });

  it('clears the in-app origin when navigation removes the route before direct re-entry', async () => {
    let fallbackFocusCount = 0;
    rememberReactionPeopleReturnFocus('/@writer/post-1/reactions', undefined, () => {
      fallbackFocusCount += 1;
    });
    await renderRoute();

    assert.equal(hasReactionPeopleReturnToOrigin(), true);
    for (const listener of navigationListeners) {
      listener({ data: { action: { type: 'GO_BACK' } }, type: 'beforeRemove' });
    }
    assert.equal(hasReactionPeopleReturnToOrigin(), false);
    assert.equal(fallbackFocusCount, 0);
    for (const listener of transitionEndListeners) {
      listener({ data: { closing: true }, type: 'transitionEnd' });
    }
    assert.equal(fallbackFocusCount, 1);
    for (const listener of navigationListeners) {
      listener({ data: { action: { type: 'GO_BACK' } }, type: 'beforeRemove' });
    }
    assert.equal(fallbackFocusCount, 1);

    await act(async () => renderer?.unmount());
    renderer = null;
    await renderRoute();
    assert.ok(reactionPeopleScreenProps);
    reactionPeopleScreenProps.onBack();

    assert.deepEqual(routerReplacements, ['/@writer/post-1']);
  });

  it('keeps the in-app origin when canonical People replacement removes the current route', async () => {
    rememberReactionPeopleReturnFocus('/@writer/post-1/reactions');
    await renderRoute();

    for (const listener of navigationListeners) {
      listener({
        data: {
          action: {
            payload: {
              name: '(tabs)',
              params: {
                params: {
                  params: { screen: 'reactions' },
                  screen: '[postId]',
                },
                screen: '[profileHandle]',
              },
            },
            type: 'REPLACE',
          },
        },
        type: 'beforeRemove',
      });
    }

    assert.equal(hasReactionPeopleReturnToOrigin(), true);
  });

  it('waits for the Native closing transition before restoring the retained control focus', async () => {
    let nativeFocusCount = 0;
    let fallbackFocusCount = 0;
    rememberReactionPeopleReturnFocus(
      '/@writer/post-1/reactions',
      undefined,
      () => {
        fallbackFocusCount += 1;
      },
      () => {
        nativeFocusCount += 1;
        return true;
      },
    );
    await renderRoute();

    for (const listener of navigationListeners) {
      listener({ data: { action: { type: 'GO_BACK' } }, type: 'beforeRemove' });
    }
    assert.equal(nativeFocusCount, 0);
    assert.equal(fallbackFocusCount, 0);

    for (const listener of transitionEndListeners) {
      listener({ data: { closing: false }, type: 'transitionEnd' });
    }
    assert.equal(nativeFocusCount, 0);

    for (const listener of transitionEndListeners) {
      listener({ data: { closing: true }, type: 'transitionEnd' });
    }
    assert.equal(nativeFocusCount, 1);
    assert.equal(fallbackFocusCount, 0);
  });

  it('rearms the same browser history entry after Back and Forward', () => {
    const global = globalThis as unknown as { window?: unknown };
    const previousWindow = global.window;
    const listeners = new Set<(event: { state: unknown }) => void>();
    const state: Record<string, unknown> = { id: 'people' };
    let fallbackFocusCount = 0;
    global.window = {
      addEventListener: (type: string, listener: (event: { state: unknown }) => void) => {
        assert.equal(type, 'popstate');
        listeners.add(listener);
      },
      history: { state },
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      },
      removeEventListener: (type: string, listener: (event: { state: unknown }) => void) => {
        assert.equal(type, 'popstate');
        listeners.delete(listener);
      },
    };
    try {
      rememberReactionPeopleReturnFocus('/@writer/post-1/reactions', undefined, () => {
        fallbackFocusCount += 1;
      });
      bindReactionPeopleReturnEntry();
      const peopleState = state;

      for (const listener of listeners) {
        listener({ state: { id: 'origin' } });
      }
      assert.equal(hasReactionPeopleReturnToOrigin(), false);
      assert.equal(fallbackFocusCount, 1);

      for (const listener of listeners) {
        listener({ state: peopleState });
      }
      assert.equal(hasReactionPeopleReturnToOrigin(), true);
    } finally {
      clearReactionPeopleReturnState();
      global.window = previousWindow;
    }
  });

  it('falls back to the shell target when the original control is gone', () => {
    const global = globalThis as unknown as {
      document?: unknown;
      requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    };
    const previousDocument = global.document;
    const previousAnimationFrame = global.requestAnimationFrame;
    let fallbackFocusCount = 0;
    global.document = {
      getElementById: () => null,
      querySelectorAll: () => {
        throw new Error('exact focus ids must not fall back to an unrelated anchor');
      },
    };
    global.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };

    try {
      rememberReactionPeopleReturnFocus('/@writer/post-1/reactions', 'missing', () => {
        fallbackFocusCount += 1;
      });
      restoreReactionPeopleReturnFocus();
      assert.equal(fallbackFocusCount, 1);
      assert.equal(consumeReactionPeopleReturnToOrigin(), true);
    } finally {
      global.document = previousDocument;
      global.requestAnimationFrame = previousAnimationFrame;
    }
  });

  it('prefers the retained Native control focus before the shell fallback', () => {
    let nativeFocusCount = 0;
    let fallbackFocusCount = 0;
    rememberReactionPeopleReturnFocus(
      '/@writer/post-1/reactions',
      undefined,
      () => {
        fallbackFocusCount += 1;
      },
      () => {
        nativeFocusCount += 1;
        return true;
      },
    );

    restoreReactionPeopleReturnFocus();

    assert.equal(nativeFocusCount, 1);
    assert.equal(fallbackFocusCount, 0);
  });

  it('uses the shell fallback when the retained Native control is gone', () => {
    let fallbackFocusCount = 0;
    rememberReactionPeopleReturnFocus(
      '/@writer/post-1/reactions',
      undefined,
      () => {
        fallbackFocusCount += 1;
      },
      () => false,
    );

    restoreReactionPeopleReturnFocus();

    assert.equal(fallbackFocusCount, 1);
  });
});
