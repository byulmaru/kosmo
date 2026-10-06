import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | null = null;
let paginationCompletion: ((error?: Error | null) => void) | undefined;
let profileEdges = [
  { cursor: 'cursor-a', node: { id: 'profile-a' } },
  { cursor: 'cursor-b', node: { id: 'profile-b' } },
];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => 'HashtagRelatedProfileList_hashtag',
  usePaginationFragment: () => ({
    data: {
      id: 'opaque-hashtag',
      name: 'Fediverse',
      relatedProfiles: {
        edges: profileEdges,
      },
    },
    hasNext: true,
    isLoadingNext: false,
    loadNext: (_count: number, options: { onComplete?: (error?: Error | null) => void }) => {
      paginationCompletion = options.onComplete;
    },
  }),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule(new URL('./ProfileListItem.tsx', import.meta.url), {
  ProfileListItem: ({ onPress, profile }: { onPress?: () => void; profile: { id: string } }) =>
    createElement('ProfileListItem', { identity: profile.id, onPress }),
});
mockModule(new URL('../pagination/PaginationSurface.tsx', import.meta.url), {
  PaginationSurface: (props: object) => createElement('PaginationSurface', props),
});
mockModule(new URL('../pagination/useAutomaticPagination.ts', import.meta.url), {
  useAutomaticPagination: ({
    loadNext,
  }: {
    loadNext: (count: number, options: { onComplete: (error: Error | null) => void }) => void;
  }) => ({
    endRef: { current: null },
    loadError: false,
    loadNextPage: () => loadNext(20, { onComplete: () => undefined }),
    nativeScrollProps: { onScroll: () => undefined },
  }),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ border: '#ddd', text: '#111', textSecondary: '#666' }),
});

let HashtagRelatedProfileList: ComponentType<{
  hashtag: unknown;
  leading?: unknown;
  onVisibleResults?: (hashtagId: string, resultCount: number) => void;
  onResultSelected?: (hashtagId: string) => void;
}>;
let HashtagRelatedProfileListState: ComponentType<{
  leading?: unknown;
  state: 'error' | 'loading' | 'notFound';
}>;

before(async () => {
  const module = await import('./HashtagRelatedProfileList');
  HashtagRelatedProfileList = module.HashtagRelatedProfileList as typeof HashtagRelatedProfileList;
  HashtagRelatedProfileListState = module.HashtagRelatedProfileListState as ComponentType<{
    leading?: unknown;
    state: 'error' | 'loading' | 'notFound';
  }>;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  paginationCompletion = undefined;
  profileEdges = [
    { cursor: 'cursor-a', node: { id: 'profile-a' } },
    { cursor: 'cursor-b', node: { id: 'profile-b' } },
  ];
});

describe('Hashtag 관련 Profile 목록 viewport', () => {
  it('성공한 빈 목록은 empty callback을 전달하고 Profile item을 렌더하지 않는다', async () => {
    profileEdges = [];
    const onVisibleResults = mock.fn();
    await act(async () => {
      renderer = create(
        createElement(HashtagRelatedProfileList, { hashtag: {}, onVisibleResults }),
      );
    });
    assert.ok(renderer);
    assert.equal(onVisibleResults.mock.callCount(), 1);
    assert.equal(onVisibleResults.mock.calls[0]?.arguments[1], 0);
    assert.equal(
      renderer.root.findAll((node) => (node.type as unknown) === 'ProfileListItem').length,
      0,
    );
    assert.equal(
      renderer.root.find((node) => (node.type as unknown) === 'StateView').props.title,
      '관련 프로필이 없어요',
    );
  });

  it('성공과 상태 화면에 같은 leading action을 전달한다', async () => {
    const leading = createElement('BackButton');
    await act(async () => {
      renderer = create(createElement(HashtagRelatedProfileList, { hashtag: {}, leading }));
    });
    assert.ok(renderer);
    assert.equal(
      renderer.root.find((node) => (node.type as unknown) === 'PageHeader').props.leading,
      leading,
    );

    for (const state of ['loading', 'error', 'notFound'] as const) {
      await act(async () => {
        renderer?.update(createElement(HashtagRelatedProfileListState, { leading, state }));
      });
      assert.equal(
        renderer.root.find((node) => (node.type as unknown) === 'PageHeader').props.leading,
        leading,
      );
    }
  });

  it('목록 항목과 자동 pagination 표식을 같은 ScrollView 안에 렌더한다', async () => {
    await act(async () => {
      renderer = create(createElement(HashtagRelatedProfileList, { hashtag: {} }));
    });
    assert.ok(renderer);

    const scrollView = renderer.root.find((node) => (node.type as unknown) === 'ScrollView');
    assert.deepEqual(
      scrollView
        .findAll((node) => (node.type as unknown) === 'ProfileListItem')
        .map((node) => node.props.identity),
      ['profile-a', 'profile-b'],
    );
    assert.equal(typeof scrollView.props.onScroll, 'function');
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'PaginationSurface').length,
      1,
    );
  });

  it('표시된 결과와 항목 선택을 확인된 Hashtag identity로 전달한다', async () => {
    const onVisibleResults = mock.fn();
    const onResultSelected = mock.fn();

    await act(async () => {
      renderer = create(
        createElement(HashtagRelatedProfileList, {
          hashtag: {},
          onVisibleResults,
          onResultSelected,
        }),
      );
    });
    assert.ok(renderer);

    const scrollView = renderer.root.find((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(onVisibleResults.mock.callCount(), 1);
    assert.equal(onVisibleResults.mock.calls[0]?.arguments[1], 2);

    const firstProfile = scrollView.findAll(
      (node) => (node.type as unknown) === 'ProfileListItem',
    )[0];
    await act(async () => firstProfile?.props.onPress());
    assert.equal(onResultSelected.mock.callCount(), 1);

    await act(async () => {
      scrollView.find((node) => (node.type as unknown) === 'PaginationSurface').props.onRetry();
      paginationCompletion?.(new Error('pagination failed'));
    });
    assert.deepEqual(onResultSelected.mock.calls[0]?.arguments, ['opaque-hashtag']);
  });
});
