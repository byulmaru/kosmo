import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  InfiniteListRenderer,
  InfiniteListRenderProps,
} from '@/components/pagination/InfiniteList';
import type { ProfileConnectionList_followersProfile$key } from './__generated__/ProfileConnectionList_followersProfile.graphql';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ConnectionItem = Readonly<{ cursor: string; profile: { id: string } }>;
type PaginationRequest = Readonly<{
  count: number;
  onComplete: (error: Error | null) => void;
}>;

const paginationEdges = [{ cursor: 'edge-1', node: { follower: { id: 'profile-1' } } }];
const loadRequests: PaginationRequest[] = [];
let capturedProps: InfiniteListRenderProps<ConnectionItem> | undefined;
let renderer: ReactTestRenderer | null = null;
let ProfileConnectionList: ComponentType<{
  kind: 'followers';
  profile: ProfileConnectionList_followersProfile$key;
  renderList: InfiniteListRenderer;
}>;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  usePaginationFragment: () => ({
    data: { followers: { edges: paginationEdges } },
    hasNext: true,
    isLoadingNext: false,
    loadNext: (count: number, options?: { onComplete?: (error: Error | null) => void }) => {
      loadRequests.push({ count, onComplete: options?.onComplete ?? (() => undefined) });
    },
  }),
});
mockModule('@/components/pagination/InfiniteList', {
  InfiniteList: 'InfiniteList',
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children: string } & Record<string, unknown>) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  Skeleton: 'Skeleton',
  StateView: (props: Record<string, unknown>) => createElement('StateView', props),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ border: '#ddd', text: '#111' }),
});
mockModule('@/theme/tokens', {
  layoutRecipes: { listRow: {} },
  spacing: { lg: 24, md: 16, sm: 8, xxxl: 64 },
  typography: { md: {} },
});
mockModule(new URL('./ProfileListItem.tsx', import.meta.url), {
  ProfileListItem: ({ profile }: { profile: { id: string } }) =>
    createElement('ProfileListItem', { identity: profile.id }),
});

before(async () => {
  ({ ProfileConnectionList } = await import('./ProfileConnectionList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  capturedProps = undefined;
  loadRequests.length = 0;
});

function renderList<Item>(props: InfiniteListRenderProps<Item>): ReactElement {
  capturedProps = props as unknown as InfiniteListRenderProps<ConnectionItem>;
  const footer = props.renderFooter?.({
    hasNext: props.hasNext,
    isLoadingNext: props.isLoadingNext,
    loadError: false,
    onRetry: () => undefined,
  });
  return createElement(
    'InfiniteList',
    { listIdentityKey: props.listIdentityKey },
    props.listHeader,
    ...props.data.map((item, index) => props.renderItem({ index, item })),
    footer,
  );
}

function requireButton() {
  assert.ok(renderer);
  const button = renderer.root.findAll((node) => (node.type as unknown) === 'Button')[0];
  assert.ok(button);
  return button;
}

describe('ProfileConnectionList manual renderer', () => {
  it('성공 뒤에도 더 불러오기를 유지하고 실패는 기능 소유 retry로 복구한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(ProfileConnectionList, {
          kind: 'followers',
          profile: { id: 'profile-alice' } as unknown as ProfileConnectionList_followersProfile$key,
          renderList,
        }),
      );
    });

    await act(async () => requireButton().props.onPress());
    assert.equal(loadRequests.length, 1);
    assert.equal(loadRequests[0]?.count, 20);
    await act(async () => loadRequests[0]?.onComplete(null));
    assert.equal(
      renderer?.root.findAll((node) => (node.type as unknown) === 'StateView').length,
      0,
    );
    assert.equal(requireButton().props.children, '더 불러오기');

    await act(async () => requireButton().props.onPress());
    assert.equal(loadRequests.length, 2);
    await act(async () => loadRequests[1]?.onComplete(new Error('page failed')));

    const retry = renderer?.root.findAll((node) => (node.type as unknown) === 'StateView')[0];
    assert.ok(retry);
    assert.equal(retry.props.title, '팔로워를 더 불러오지 못했어요');
    assert.equal(typeof retry.props.onAction, 'function');

    await act(async () => retry.props.onAction());
    assert.equal(loadRequests.length, 3);
    assert.equal(loadRequests[2]?.count, 20);
    await act(async () => loadRequests[2]?.onComplete(null));
    assert.equal(
      renderer?.root.findAll((node) => (node.type as unknown) === 'StateView').length,
      0,
    );
    assert.equal(requireButton().props.children, '더 불러오기');
    assert.equal(capturedProps?.paginationMode, 'manual');
  });
});
