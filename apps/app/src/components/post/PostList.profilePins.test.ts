import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as Relay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import query from '../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfilePostListPageQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { ProfilePostListPageQuery } from '../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfilePostListPageQuery.graphql';
import type { PostList as PostListType } from './PostList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const stub = (path: string, exports: object) => mock.module(path, { exports } as never);
const children = ({ children }: { children?: ReactNode }) => children;
let renderer: ReactTestRenderer | undefined;
const focusList = mock.fn();
let PostList: typeof PostListType;
const requests: Array<{
  name: string;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
}> = [];
stub('react-relay', {
  ...Relay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:fragment|query) (\w+)/)?.[1];
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
stub('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
  StyleSheet: { create: (value: unknown) => value },
  View: 'View',
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
});
stub('@/theme/ThemeProvider', { useTheme: () => ({}) });
stub('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => () => undefined }) });
stub('@/components/ui/Button', { Button: (props: object) => createElement('Button', props) });
stub('@/components/ui/StateView', { Skeleton: 'Skeleton', StateView: 'StateView' });
stub('@/components/pagination/InfiniteList', {
  InfiniteList: ({
    data,
    renderItem,
    empty,
    ...props
  }: {
    data: Array<{ node: { id: string } }>;
    renderItem: (input: { item: unknown }) => ReactNode;
    empty?: ReactNode;
  }) =>
    createElement(
      'InfiniteList',
      props,
      data.length
        ? data.map((item) => createElement('Row', { key: item.node.id }, renderItem({ item })))
        : empty,
    ),
});
for (const [file, name] of [
  ['PostActionAuthentication', 'PostActionAuthenticationProvider'],
  ['PostComposerCoordinator', 'PostComposerCoordinatorProvider'],
  ['PostMediaViewerHost', 'PostMediaViewerHostProvider'],
]) {
  stub(new URL(`./${file}.tsx`, import.meta.url).href, { [name!]: children });
}
stub(new URL('./PostListItem.tsx', import.meta.url).href, {
  PostListItem: (props: object) => createElement('PostListItem', props),
});
before(async () => {
  ({ PostList } = await import('./PostList'));
});
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = undefined;
  requests.length = 0;
});
function Harness() {
  const data = Relay.useLazyLoadQuery<ProfilePostListPageQuery>(query, { handle: '@owner' });
  return createElement(PostList, { profile: data.profileByHandle });
}
async function start() {
  const environment = new Environment({
    store: new Store(new RecordSource()),
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, variables, sink });
      }),
    ),
  });
  await act(async () => {
    renderer = create(
      createElement(Relay.RelayEnvironmentProvider, {
        environment,
        children: createElement(Suspense, { fallback: null }, createElement(Harness)),
      }),
      { createNodeMock: () => ({ focus: focusList }) },
    );
  });
  return environment;
}
const connection = (ids: string[], hasNextPage = false) => ({
  edges: ids.map((id) => ({
    cursor: id,
    node: {
      __typename: 'Post',
      id,
      createdAt: '2026-09-30T00:00:00Z',
      state: 'ACTIVE',
      visibility: 'PUBLIC',
      content: null,
      replyParent: null,
      repostSource: null,
      viewerBookmark: null,
      repostCount: 0,
      viewerRepost: null,
      viewerReactions: [],
      reactionCounts: [],
      profile: {
        __typename: 'Profile',
        id: 'author',
        displayName: 'Author',
        handle: 'author',
        relativeHandle: '@author',
        avatar: null,
        instance: { kind: 'LOCAL' },
        viewerState: null,
      },
    },
  })),
  pageInfo: {
    startCursor: ids[0] ?? null,
    endCursor: ids.at(-1) ?? null,
    hasNextPage,
    hasPreviousPage: false,
  },
});
const profile = (kind: string, pins: string[], posts: string[], hasNext = false) => ({
  __typename: 'Profile',
  id: 'owner',
  instance: { kind },
  viewerState: null,
  pinnedPosts: connection(pins, hasNext),
  posts: connection(posts),
});
async function respond(data: Record<string, unknown>) {
  await act(async () => {
    requests.at(-1)!.sink.next({ data });
    requests.at(-1)!.sink.complete();
  });
}
const all = (type: string) => renderer!.root.findAll((node) => node.type === type);
const cards = () =>
  all('PostListItem').map((node) => [node.props.post.__id, Boolean(node.props.pinned)]);
it('Local shows first pin, permits duplicates, and survives deleted records', async () => {
  const environment = await start();
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['first', 'second'], ['first']),
  });
  assert.deepEqual(cards(), [
    ['first', true],
    ['first', false],
  ]);
  assert.equal(all('PostListItem')[1]!.props.profilePin.onUnpinned, undefined);
  all('PostListItem')[0]!.props.profilePin.onUnpinned();
  assert.equal(focusList.mock.callCount(), 1);
  await act(async () => environment.commitUpdate((store) => store.delete('first')));
  assert.deepEqual(cards(), [['second', true]]);
  assert.equal(all('StateView').length, 0);
  assert.equal(all('InfiniteList').length, 1);
  assert.equal(all('Button').length, 0);
});
it('Remote paginates and retries pins independently of chronology', async () => {
  await start();
  const pins = Array.from({ length: 20 }, (_, index) => `pin-${index}`);
  await respond({
    currentSession: null,
    profileByHandle: profile('REMOTE', pins, ['chronology'], true),
  });
  assert.equal(all('InfiniteList').length, 1);
  await act(async () => all('Button')[0]!.props.onPress());
  assert.equal(requests.at(-1)!.name, 'PostListProfilePinnedNextPageQuery');
  assert.equal(requests.at(-1)!.variables.cursor, 'pin-19');
  await act(async () => requests.at(-1)!.sink.error(new Error('offline')));
  assert.equal(all('Button')[0]!.props.accessibilityLabel, '고정된 게시글 다시 시도');
  await act(async () => all('Button')[0]!.props.onPress());
  await respond({
    node: { __typename: 'Profile', id: 'owner', pinnedPosts: connection(['pin-20']) },
  });
  assert.deepEqual(
    cards(),
    [...pins, 'pin-20'].map((id) => [id, true]).concat([['chronology', false]]),
  );
  assert.equal(all('Button').length, 0);
});
