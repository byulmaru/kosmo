import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
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
      assert.equal(event, 'beforeRemove');
      navigationListeners.add(listener);
      return () => navigationListeners.delete(listener);
    },
  }),
  useRouter: () => ({
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
  reactionPeopleScreenProps = null;
  routerReplacements.length = 0;
  consumeReactionPeopleReturnToOrigin();
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

  it('clears the in-app origin when navigation removes the route before direct re-entry', async () => {
    rememberReactionPeopleReturnFocus('/@writer/post-1/reactions');
    await renderRoute();

    assert.equal(hasReactionPeopleReturnToOrigin(), true);
    for (const listener of navigationListeners) {
      listener({ data: { action: { type: 'GO_BACK' } }, type: 'beforeRemove' });
    }
    assert.equal(hasReactionPeopleReturnToOrigin(), false);

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
});
