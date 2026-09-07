import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { Component, createElement, Fragment, Suspense } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { InfiniteListRenderer, InfiniteListRenderProps } from '../pagination/InfiniteList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Item = Readonly<{ id: string; label: string }>;
type FeatureKind = 'followers' | 'following' | 'posts';
type FeatureState = 'content' | 'error' | 'loading';

type Feature = Readonly<{
  kind: FeatureKind;
  mode: 'automatic' | 'manual';
  state?: FeatureState;
}>;

const platform = { OS: 'ios' };
let profileQueryState: 'error' | 'loading' | 'resolved' = 'resolved';
let profileQueryPromise: Promise<void> | null = null;
let resolveProfileQuery: (() => void) | null = null;
let renderer: ReactTestRenderer | null = null;
let ProfileListLayout: ComponentType<{
  children: (renderList: InfiniteListRenderer) => ReactElement;
  handle: string;
}>;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  FlatList: 'FlatList',
  Platform: platform,
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useLazyLoadQuery: () => {
    if (profileQueryState === 'loading') {
      if (!profileQueryPromise) {
        throw new Error('profile query promise was not prepared');
      }
      throw profileQueryPromise;
    }
    if (profileQueryState === 'error') {
      throw new Error('profile query failed');
    }

    return {
      profileByHandle: {
        handle: 'alice',
        id: 'profile-alice',
        instance: { kind: 'LOCAL' },
        viewerState: { isSelf: false, membership: null },
      },
    };
  },
});
mockModule(new URL('../pagination/InfiniteList.tsx', import.meta.url), {
  InfiniteList: (props: InfiniteListRenderProps<Item> & { header?: ReactElement | null }) =>
    createElement(
      'InfiniteList',
      props,
      props.header,
      props.data.map((item, index) =>
        createElement(
          Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ index, item }),
        ),
      ),
      props.data.length === 0 ? props.empty : null,
      props.renderFooter?.({
        hasNext: props.hasNext,
        isLoadingNext: props.isLoadingNext,
        loadError: false,
        onRetry: () => undefined,
      }),
    ),
});
mockModule(new URL('./FollowButton.tsx', import.meta.url), {
  FollowButton: () => createElement('FollowButton'),
});
mockModule(new URL('./ProfileHero.tsx', import.meta.url), {
  ProfileHero: ({
    action,
    loading,
    profile,
  }: {
    action?: ReactElement;
    loading?: boolean;
    profile?: { handle: string };
  }) => createElement('ProfileHero', { identity: loading ? 'loading' : profile?.handle }, action),
});
type TestRouteBoundaryProps = {
  children?: ReactNode;
  error?: (resetErrorBoundary: () => void) => ReactNode;
  loading: ReactNode;
  title: string;
};

class TestRouteErrorBoundary extends Component<
  Pick<TestRouteBoundaryProps, 'children' | 'error' | 'title'>,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.error
        ? this.props.error(() => this.setState({ error: null }))
        : createElement('RouteError', { error: this.state.error, title: this.props.title });
    }

    return this.props.children ?? null;
  }
}

mockModule(new URL('../RouteBoundary.tsx', import.meta.url), {
  RouteBoundary: ({ children, error, loading, title }: TestRouteBoundaryProps) =>
    createElement(
      TestRouteErrorBoundary,
      { error, title },
      createElement(Suspense, { fallback: loading }, children),
    ),
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({ children }: { children: ReactElement }) => children,
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children }: { children: string }) => createElement('Button', null, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

before(async () => {
  ({ ProfileListLayout } = await import('./ProfileListLayout'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'ios';
  profileQueryState = 'resolved';
  profileQueryPromise = null;
  resolveProfileQuery = null;
});

function suspendProfileQuery() {
  profileQueryState = 'loading';
  profileQueryPromise = new Promise<void>((resolve) => {
    resolveProfileQuery = resolve;
  });
}

function resolveSuspendedProfileQuery() {
  profileQueryState = 'resolved';
  resolveProfileQuery?.();
}

function renderFeature(renderList: InfiniteListRenderer, feature: Feature): ReactElement {
  const state = feature.state ?? 'content';
  const data = state === 'content' ? [{ id: feature.kind, label: feature.kind }] : [];
  const listProps: InfiniteListRenderProps<Item> = {
    data,
    empty: createElement('FeatureState', { kind: feature.kind, state }),
    hasNext: feature.kind !== 'posts',
    isLoadingNext: false,
    keyExtractor: (item) => item.id,
    listHeader: createElement('FeatureTitle', { kind: feature.kind }),
    listIdentityKey: `profile:alice:${feature.kind}`,
    loadNext: () => undefined,
    pageSize: 20,
    paginationMode: feature.mode,
    renderFooter: () =>
      feature.kind === 'posts' ? null : createElement('FeatureFooter', { kind: feature.kind }),
    renderItem: ({ item }) => createElement('FeatureRow', { id: item.id }, item.label),
  };

  const result = renderList<Item>(listProps);
  assert.ok(result);
  return result;
}

function list() {
  assert.ok(renderer);
  const value = renderer.root.findAll((node) => (node.type as unknown) === 'InfiniteList')[0];
  assert.ok(value);
  return value;
}

function render(feature: Feature) {
  renderer = create(
    createElement(ProfileListLayout, {
      handle: 'alice',
      children: (renderList) => renderFeature(renderList, feature),
    }),
  );
}

describe('ProfileListLayout composition', () => {
  it('프로필 query가 suspend하는 동안 feature child를 호출하지 않고 loading Hero를 보여준다', async () => {
    suspendProfileQuery();
    let featureChildCalled = false;

    await act(async () => {
      renderer = create(
        createElement(ProfileListLayout, {
          handle: 'alice',
          children: (renderList) => {
            featureChildCalled = true;
            return renderFeature(renderList, { kind: 'posts', mode: 'automatic' });
          },
        }),
      );
    });

    assert.equal(featureChildCalled, false);
    assert.deepEqual(
      renderer?.root
        .findAll((node) => (node.type as unknown) === 'ProfileHero')
        .map((node) => node.props.identity),
      ['loading'],
    );
    assert.equal(
      renderer?.root.findAll((node) => (node.type as unknown) === 'InfiniteList').length,
      0,
    );

    const suspended = profileQueryPromise;
    assert.ok(suspended);
    await act(async () => {
      resolveSuspendedProfileQuery();
      await suspended;
    });

    assert.equal(featureChildCalled, true);
    assert.deepEqual(
      list()
        .findAll((node) => (node.type as unknown) === 'ProfileHero')
        .map((node) => node.props.identity),
      ['alice'],
    );
  });

  it('프로필 query error를 RouteBoundary fallback으로 전달하고 feature list를 만들지 않는다', async () => {
    profileQueryState = 'error';
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await act(async () => {
        renderer = create(
          createElement(ProfileListLayout, {
            handle: 'alice',
            children: () => createElement('FeatureChild'),
          }),
        );
      });

      const routeError = renderer?.root.findAll(
        (node) => (node.type as unknown) === 'RouteError',
      )[0];
      assert.ok(routeError);
      assert.equal(routeError.props.title, '프로필을 불러오지 못했어요');
      assert.equal(
        renderer?.root.findAll((node) => (node.type as unknown) === 'FeatureChild').length,
        0,
      );
      assert.equal(
        renderer?.root.findAll((node) => (node.type as unknown) === 'InfiniteList').length,
        0,
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  for (const feature of [
    { kind: 'posts', mode: 'automatic' },
    { kind: 'followers', mode: 'manual' },
    { kind: 'following', mode: 'manual' },
  ] as const) {
    it(`프로필 ${feature.kind} feature의 Hero와 rows를 같은 InfiniteList에 조합한다`, async () => {
      await act(async () => render(feature));

      const infiniteList = list();
      assert.equal(
        renderer?.root.findAll((node) => (node.type as unknown) === 'InfiniteList').length,
        1,
      );
      assert.equal(infiniteList.props.paginationMode, feature.mode);
      assert.deepEqual(
        infiniteList
          .findAll((node) => (node.type as unknown) === 'ProfileHero')
          .map((node) => node.props.identity),
        ['alice'],
      );
      assert.deepEqual(
        infiniteList
          .findAll((node) => (node.type as unknown) === 'FeatureRow')
          .map((node) => node.props.id),
        [feature.kind],
      );
      assert.deepEqual(
        infiniteList
          .findAll((node) => (node.type as unknown) === 'FeatureTitle')
          .map((node) => node.props.kind),
        [feature.kind],
      );
      assert.equal(
        infiniteList.findAll((node) => (node.type as unknown) === 'FeatureFooter').length,
        feature.kind === 'posts' ? 0 : 1,
      );
    });
  }

  for (const state of ['loading', 'error'] as const) {
    it(`목록 ${state} 상태에서도 ProfileHero를 같은 InfiniteList header로 유지한다`, async () => {
      await act(async () => render({ kind: 'followers', mode: 'manual', state }));

      const infiniteList = list();
      assert.deepEqual(
        infiniteList
          .findAll((node) => (node.type as unknown) === 'ProfileHero')
          .map((node) => node.props.identity),
        ['alice'],
      );
      assert.deepEqual(
        infiniteList
          .findAll((node) => (node.type as unknown) === 'FeatureState')
          .map((node) => node.props.state),
        [state],
      );
      assert.equal(
        infiniteList.findAll((node) => (node.type as unknown) === 'FeatureFooter').length,
        1,
      );
    });
  }
});
