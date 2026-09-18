import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { getReactionPeopleHref, resolveReactionPeopleType } from './reactionPeopleRoute';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerReplacements: string[] = [];
let canGoBack = true;
let routerBackCount = 0;
let renderer: ReactTestRenderer | null = null;
let route: ComponentType | null = null;
let routeFrameOnBack: (() => void) | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ profileHandle: '@writer', postId: 'post-1' }),
  useRouter: () => ({
    back: () => {
      routerBackCount += 1;
    },
    canGoBack: () => canGoBack,
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
  ReactionPeopleRouteFrame: ({ children, onBack }: { children: unknown; onBack: () => void }) => {
    routeFrameOnBack = onBack;
    return children;
  },
  ReactionPeopleScreen: () => createElement('ReactionPeopleScreen'),
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
  canGoBack = true;
  routerBackCount = 0;
  routeFrameOnBack = null;
  routerReplacements.length = 0;
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

  it('uses router Back when the route has navigation history', async () => {
    await renderRoute();
    assert.ok(routeFrameOnBack);

    routeFrameOnBack();

    assert.equal(routerBackCount, 1);
    assert.deepEqual(routerReplacements, []);
  });

  it('replaces the canonical Post when the route has no navigation history', async () => {
    canGoBack = false;
    await renderRoute();
    assert.ok(routeFrameOnBack);

    routeFrameOnBack();

    assert.equal(routerBackCount, 0);
    assert.deepEqual(routerReplacements, ['/@writer/post-1']);
  });
});
