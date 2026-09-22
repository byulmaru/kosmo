import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | null = null;
let paginationCompletion: ((error?: Error | null) => void) | undefined;

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
      name: 'Fediverse',
      relatedProfiles: {
        edges: [
          { cursor: 'cursor-a', node: { id: 'profile-a' } },
          { cursor: 'cursor-b', node: { id: 'profile-b' } },
        ],
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
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children: string }) =>
    createElement('Button', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ border: '#ddd', text: '#111', textSecondary: '#666' }),
});

let HashtagRelatedProfileList: ComponentType<{
  hashtag: unknown;
  onInitialResults?: (hasResults: boolean) => void;
  onPaginationFailure?: () => void;
  onResultSelected?: () => void;
}>;

before(async () => {
  const module = await import('./HashtagRelatedProfileList');
  HashtagRelatedProfileList = module.HashtagRelatedProfileList as typeof HashtagRelatedProfileList;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  paginationCompletion = undefined;
});

describe('Hashtag 관련 Profile 목록 viewport', () => {
  it('목록 항목과 pagination action을 같은 ScrollView 안에 렌더한다', async () => {
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
    assert.equal(scrollView.findAll((node) => (node.type as unknown) === 'Button').length, 1);
  });

  it('첫 결과, 항목 선택, pagination 실패를 각각 계측 callback으로 전달한다', async () => {
    const onInitialResults = mock.fn();
    const onPaginationFailure = mock.fn();
    const onResultSelected = mock.fn();

    await act(async () => {
      renderer = create(
        createElement(HashtagRelatedProfileList, {
          hashtag: {},
          onInitialResults,
          onPaginationFailure,
          onResultSelected,
        }),
      );
    });
    assert.ok(renderer);

    const scrollView = renderer.root.find((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(onInitialResults.mock.callCount(), 1);
    assert.equal(onInitialResults.mock.calls[0]?.arguments[0], true);

    const firstProfile = scrollView.findAll(
      (node) => (node.type as unknown) === 'ProfileListItem',
    )[0];
    await act(async () => firstProfile?.props.onPress());
    assert.equal(onResultSelected.mock.callCount(), 1);

    await act(async () => {
      scrollView.find((node) => (node.type as unknown) === 'Button').props.onPress();
      paginationCompletion?.(new Error('pagination failed'));
    });
    assert.equal(onPaginationFailure.mock.callCount(), 1);
  });
});
