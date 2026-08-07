import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | null = null;

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
    loadNext: () => undefined,
  }),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule(new URL('./ProfileListItem.tsx', import.meta.url), {
  ProfileListItem: ({ profile }: { profile: { id: string } }) =>
    createElement('ProfileListItem', { identity: profile.id }),
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

let HashtagRelatedProfileList: ComponentType<{ hashtag: unknown }>;

before(async () => {
  const module = await import('./HashtagRelatedProfileList');
  HashtagRelatedProfileList = module.HashtagRelatedProfileList as ComponentType<{
    hashtag: unknown;
  }>;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
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
});
