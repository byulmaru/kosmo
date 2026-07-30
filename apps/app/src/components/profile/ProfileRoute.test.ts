import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createContext, createElement, useContext } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryMode = 'error' | 'loading' | 'success';
type QueryName = 'ProfileLayoutQuery' | 'ProfilePostListPageQuery';

const queryModes: Record<QueryName, QueryMode> = {
  ProfileLayoutQuery: 'success',
  ProfilePostListPageQuery: 'success',
};
const queryHistory: Array<{
  fetchKey: string;
  handle: string;
  query: QueryName;
}> = [];
const pending = new Promise<never>(() => undefined);

type RouteParams = { profileHandle?: string | string[] };

const LocalParamsContext = createContext<RouteParams>({});

let globalParams: RouteParams = {};
let layoutLocalParams: RouteParams = {};
let screenLocalParams: RouteParams = {};
let renderer: ReactTestRenderer | null = null;
let SlotContent: ComponentType | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Slot: () =>
    SlotContent
      ? createElement(
          LocalParamsContext.Provider,
          { value: screenLocalParams },
          createElement(SlotContent),
        )
      : null,
  useGlobalSearchParams: () => globalParams,
  useLocalSearchParams: () => useContext(LocalParamsContext),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    const query = parts.join('').match(/query (ProfileLayoutQuery|ProfilePostListPageQuery)/)?.[1];
    assert.ok(query);
    return query as QueryName;
  },
  useLazyLoadQuery: (
    query: QueryName,
    variables: { handle: string },
    options: { fetchKey: string },
  ) => {
    queryHistory.push({ fetchKey: options.fetchKey, handle: variables.handle, query });
    const mode = queryModes[query];
    if (mode === 'loading') {
      throw pending;
    }
    if (mode === 'error') {
      throw new Error(`${query}:${variables.handle}`);
    }

    return {
      profileByHandle: {
        handle: variables.handle,
        id: `profile:${variables.handle}`,
      },
    };
  },
});
mockModule(new URL('./ProfileHero.tsx', import.meta.url), {
  ProfileHero: ({
    action,
    loading,
    profile,
  }: {
    action?: ReturnType<typeof createElement>;
    loading?: boolean;
    profile?: { handle: string };
  }) => createElement('ProfileHero', { identity: loading ? 'loading' : profile?.handle }, action),
});
mockModule(new URL('./FollowButton.tsx', import.meta.url), {
  FollowButton: ({ profile }: { profile: { handle: string } }) =>
    createElement('FollowButton', { identity: profile.handle }),
});
mockModule(new URL('../post/PostList.tsx', import.meta.url), {
  PostList: ({
    error,
    loading,
    onRetry,
    profile,
  }: {
    error?: boolean;
    loading?: boolean;
    onRetry?: () => void;
    profile?: { handle: string };
  }) =>
    createElement('PostList', {
      identity: error ? 'error' : loading ? 'loading' : profile?.handle,
      onRetry,
    }),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({ revision: 4 }),
});

let ProfileLayout: ComponentType;
let ProfilePostListPage: ComponentType;

before(async () => {
  ({ default: ProfileLayout } = await import('../../app/(tabs)/(profile)/[profileHandle]/_layout'));
  ({ default: ProfilePostListPage } =
    await import('../../app/(tabs)/(profile)/[profileHandle]/index'));
  SlotContent = ProfilePostListPage;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  globalParams = {};
  layoutLocalParams = {};
  screenLocalParams = {};
  queryModes.ProfileLayoutQuery = 'success';
  queryModes.ProfilePostListPageQuery = 'success';
  queryHistory.length = 0;
});

async function renderRoute(profileHandle: string) {
  globalParams = { profileHandle };
  screenLocalParams = { profileHandle };
  if (!renderer) {
    layoutLocalParams = { profileHandle };
  }
  await act(async () => {
    if (renderer) {
      renderer.update(
        createElement(
          LocalParamsContext.Provider,
          { value: layoutLocalParams },
          createElement(ProfileLayout),
        ),
      );
    } else {
      renderer = create(
        createElement(
          LocalParamsContext.Provider,
          { value: layoutLocalParams },
          createElement(ProfileLayout),
        ),
      );
    }
  });
  assert.ok(renderer);
}

function identities(type: string) {
  return rendered(type).map((node) => node.props.identity as string);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('profile route parameter lifecycle', () => {
  it('local → remote → local 뒤로 가기에서 header, action, nested list를 같은 identity로 전환한다', async () => {
    await renderRoute('@local');
    assert.deepEqual(identities('ProfileHero'), ['local']);
    assert.deepEqual(identities('FollowButton'), ['local']);
    assert.deepEqual(identities('PostList'), ['local']);

    await renderRoute('@remote@activitypub.example');
    assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
    assert.deepEqual(identities('FollowButton'), ['remote@activitypub.example']);
    assert.deepEqual(identities('PostList'), ['remote@activitypub.example']);

    await renderRoute('@local');
    assert.deepEqual(identities('ProfileHero'), ['local']);
    assert.deepEqual(identities('FollowButton'), ['local']);
    assert.deepEqual(identities('PostList'), ['local']);
    assert.deepEqual(
      queryHistory.slice(-2).map(({ handle, query }) => ({ handle, query })),
      [
        { handle: 'local', query: 'ProfileLayoutQuery' },
        { handle: 'local', query: 'ProfilePostListPageQuery' },
      ],
    );
  });

  it('handle 전환 중 layout과 nested query의 기존 loading fallback을 유지한다', async () => {
    await renderRoute('@local');

    queryModes.ProfileLayoutQuery = 'loading';
    await renderRoute('@remote@activitypub.example');
    assert.deepEqual(identities('ProfileHero'), ['loading']);
    assert.deepEqual(identities('PostList'), []);

    queryModes.ProfileLayoutQuery = 'success';
    queryModes.ProfilePostListPageQuery = 'loading';
    await renderRoute('@remote@activitypub.example');
    assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
    assert.deepEqual(identities('PostList'), ['loading']);
  });

  it('현재 handle의 layout error를 표시하고 retry에서 같은 query를 다시 실행한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryModes.ProfileLayoutQuery = 'error';
      await renderRoute('@remote@activitypub.example');
      assert.equal(requireRendered('StateView').props.title, '프로필을 불러오지 못했어요');

      queryModes.ProfileLayoutQuery = 'success';
      await act(async () => requireRendered('StateView').props.onAction());

      assert.deepEqual(identities('ProfileHero'), ['remote@activitypub.example']);
      const latestLayoutQuery = queryHistory.findLast(
        ({ query }) => query === 'ProfileLayoutQuery',
      );
      assert.equal(latestLayoutQuery?.handle, 'remote@activitypub.example');
      assert.equal(latestLayoutQuery?.fetchKey, '4:1');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('현재 handle의 nested error와 retry 동작을 유지한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryModes.ProfilePostListPageQuery = 'error';
      await renderRoute('@local');
      assert.deepEqual(identities('ProfileHero'), ['local']);
      assert.deepEqual(identities('PostList'), ['error']);

      queryModes.ProfilePostListPageQuery = 'success';
      const errorPostList = rendered('PostList').find((node) => node.props.identity === 'error');
      assert.ok(errorPostList);
      await act(async () => errorPostList.props.onRetry());

      assert.deepEqual(identities('PostList'), ['local']);
      const latestPostQuery = queryHistory.findLast(
        ({ query }) => query === 'ProfilePostListPageQuery',
      );
      assert.equal(latestPostQuery?.handle, 'local');
      assert.equal(latestPostQuery?.fetchKey, '4:1');
    } finally {
      console.error = originalConsoleError;
    }
  });
});
