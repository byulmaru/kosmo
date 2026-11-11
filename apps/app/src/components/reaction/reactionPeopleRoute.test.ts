import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { getReactionPeopleHref, resolveReactionPeopleType } from './reactionPeopleRoute';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const routerReplacements: string[] = [];
let canGoBack = true;
let routerBackCount = 0;
let postReference = 'ReAction0001';
let requestedType: string | undefined;
let requestedReference: string | undefined;
let renderer: ReactTestRenderer | null = null;
let route: ComponentType | null = null;
let routeFrameOnBack: (() => void) | null = null;
let reactionPeopleScreenProps: Record<string, unknown> | undefined;
type RoutePost = {
  __typename: 'Post';
  content: { id: string } | null;
  id: string;
  profile: { relativeHandle: string };
  reactionCounts: Array<{ count: number; type: string }>;
  replyParent: { id: string } | null;
  repostSource: { id: string; profile: { relativeHandle: string }; slug: string } | null;
  slug: string;
  state: string;
};
const defaultPost: RoutePost = {
  __typename: 'Post',
  id: 'post-1',
  slug: 'ReAction0001',
  state: 'PUBLISHED',
  profile: { relativeHandle: '@writer' },
  content: { id: 'content-1' },
  replyParent: null,
  repostSource: null,
  reactionCounts: [{ count: 1, type: '❤️' }],
};
let routePost = defaultPost;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({
    profileHandle: '@writer',
    postId: postReference,
    type: requestedType,
  }),
  useRouter: () => ({
    back: () => {
      routerBackCount += 1;
    },
    canGoBack: () => canGoBack,
    replace: (href: string) => {
      routerReplacements.push(href);
      const pathname = href.split('/reactions')[0] ?? '';
      postReference = pathname.split('/').at(-1) ?? postReference;
    },
    setParams: () => undefined,
  }),
  useIsFocused: () => true,
});
mockModule('react-relay', {
  graphql: () => 'ReactionPeopleRouteQuery',
  useLazyLoadQuery: (_query: unknown, variables: { reference: string }) => {
    requestedReference = variables.reference;
    return { postByReference: routePost };
  },
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
  ReactionPeopleScreen: (props: Record<string, unknown>) => {
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
  canGoBack = true;
  routerBackCount = 0;
  postReference = 'ReAction0001';
  requestedType = undefined;
  requestedReference = undefined;
  routePost = defaultPost;
  reactionPeopleScreenProps = undefined;
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
      getReactionPeopleHref('@writer', 'AbCdEf123456', '❤️ & joy'),
      '/@writer/AbCdEf123456/reactions?type=%E2%9D%A4%EF%B8%8F%20%26%20joy',
    );
    assert.equal(
      getReactionPeopleHref('@writer', 'AbCdEf123456'),
      '/@writer/AbCdEf123456/reactions',
    );
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
    assert.deepEqual(routerReplacements, ['/@writer/ReAction0001']);
  });
});

test('slug lookup keeps Post.id as the reaction people screen identity', async () => {
  await renderRoute();

  assert.equal(requestedReference, 'ReAction0001');
  assert.equal(reactionPeopleScreenProps?.postId, 'post-1');
  assert.deepEqual(routerReplacements, []);
});

test('legacy 27-character Post global ID resolves and canonicalizes while retaining the requested Type', async () => {
  postReference = 'legacyPostGlobalID123456789';
  requestedType = '❤️';

  await renderRoute();

  assert.equal(requestedReference, 'legacyPostGlobalID123456789');
  assert.deepEqual(routerReplacements, ['/@writer/ReAction0001/reactions?type=%E2%9D%A4%EF%B8%8F']);

  await act(async () => {
    const Route = route;
    assert.ok(Route);
    renderer?.update(createElement(Route));
  });

  assert.equal(requestedReference, 'ReAction0001');
  assert.equal(reactionPeopleScreenProps?.postId, 'post-1');
  assert.equal(reactionPeopleScreenProps?.reactionType, '❤️');
});

test('pure Repost reaction route selects the direct source and preserves Type', async () => {
  postReference = 'legacyPostGlobalID123456789';
  requestedType = '❤️';
  routePost = {
    ...defaultPost,
    content: null,
    id: 'repost-post-id',
    repostSource: {
      id: 'source-post-id',
      profile: { relativeHandle: '@source' },
      slug: 'Source000001',
    },
    slug: 'RePost000001',
  };

  await renderRoute();

  assert.equal(requestedReference, 'legacyPostGlobalID123456789');
  assert.deepEqual(routerReplacements, ['/@source/Source000001/reactions?type=%E2%9D%A4%EF%B8%8F']);
  assert.equal(reactionPeopleScreenProps, undefined);
});
