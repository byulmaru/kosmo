import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, it, mock } from 'node:test';
import { createElement, Fragment, Suspense, useContext } from 'react';
import * as Relay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import query from '../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfilePostListPageQuery.graphql';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { ProfilePostListPageQuery } from '../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfilePostListPageQuery.graphql';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { PostList as PostListType } from './PostList';
import type { useProfilePinAction as UseProfilePinAction } from './ProfilePinAction';
import type { ProfilePinOrderContext as ProfilePinOrderContextType } from './ProfilePinOrderContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const stub = (path: string, exports: object) => mock.module(path, { exports } as never);
const children = ({ children }: { children?: ReactNode }) => children;
let renderer: ReactTestRenderer | undefined;
let PostList: typeof PostListType;
let useProfilePinAction: typeof UseProfilePinAction;
let activeActionPostId: string | null = null;
let reducedMotion = false;
let selectedProfileId = 'owner';
const toasts: string[] = [];
let ProfilePinOrderContext: typeof ProfilePinOrderContextType;
const requests: Array<{
  name: string;
  variables: Record<string, unknown>;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
}> = [];
stub('react-relay', {
  ...Relay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:fragment|query|mutation) (\w+)/)?.[1];
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
stub('react-native-svg', {
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Rect: 'Rect',
  Stop: 'Stop',
  Svg: 'Svg',
});
stub('lucide-react-native', { Pin: 'Pin', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' });
stub('@/session/SessionProvider', { useSession: () => ({ selectedProfileId }) });
stub('@/theme/ThemeProvider', { useReducedMotion: () => reducedMotion, useTheme: () => ({}) });
stub('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (message: string) => toasts.push(message) }),
});
stub('@/components/ui/ConfirmationContent', {
  ConfirmationContent: (props: object) => createElement('ConfirmationContent', props),
});
stub('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
stub('@/components/ui/Button', { Button: (props: object) => createElement('Button', props) });
stub('@/components/ui/StateView', { Skeleton: 'Skeleton', StateView: 'StateView' });
stub('@/components/pagination/InfiniteList', {
  InfiniteList: ({
    data,
    renderItem,
    empty,
    footer,
    ...props
  }: {
    data: Array<{ node: { id: string } }>;
    renderItem: (input: { item: unknown }) => ReactNode;
    empty?: ReactNode;
    footer?: ReactNode;
  }) =>
    createElement(
      'InfiniteList',
      props,
      data.length
        ? data.map((item) => createElement('Row', { key: item.node.id }, renderItem({ item })))
        : empty,
      footer,
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
  PostListItem: (props: object) =>
    createElement('PostListItem', { ...props, pinOrder: useContext(ProfilePinOrderContext) }),
});
before(async () => {
  ({ ProfilePinOrderContext } = await import('./ProfilePinOrderContext'));
  ({ PostList } = await import('./PostList'));
  ({ useProfilePinAction } = await import('./ProfilePinAction'));
});
beforeEach(() => {
  activeActionPostId = null;
  reducedMotion = false;
  selectedProfileId = 'owner';
  toasts.length = 0;
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = undefined;
  requests.length = 0;
  activeActionPostId = null;
});
function Harness() {
  const data = Relay.useLazyLoadQuery<ProfilePostListPageQuery>(
    query,
    { handle: '@owner' },
    { fetchPolicy: 'store-or-network' },
  );
  return createElement(
    Fragment,
    null,
    createElement(PostList, { profile: data.profileByHandle }),
    activeActionPostId ? createElement(ActionHarness, { postId: activeActionPostId }) : null,
  );
}
const rootQueryOperation = createOperationDescriptor(getRequest(query), { handle: '@owner' });
const queryOwner = rootQueryOperation.request;
function ActionHarness({ postId }: { postId: string }) {
  const action = useProfilePinAction({
    __fragmentOwner: queryOwner,
    __fragments: { ProfilePinAction_post: {} },
    __id: postId,
  } as unknown as ProfilePinAction_post$key);
  return createElement('ActionState', { postId, ...action }, action.confirmation);
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
    );
  });
  return environment;
}
const postNode = (id: string, isPinned: boolean) => ({
  __typename: 'Post',
  id,
  isPinned,
  createdAt: '2026-09-30T00:00:00Z',
  state: 'ACTIVE',
  visibility: 'PUBLIC',
  content: {
    __typename: 'PostContent',
    id: `${id}:content`,
    bodyText: '',
    contentWarning: null,
    document: {
      version: 1,
      summary: null,
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
    media: [],
    mentionedProfiles: [],
  },
  replyCount: 0,
  replyParent: null,
  repostSource: null,
  viewerBookmark: null,
  repostCount: 0,
  viewerRepost: null,
  viewerReactions: [],
  reactionCounts: [],
  profile: {
    __typename: 'Profile',
    id: 'owner',
    displayName: 'Owner',
    handle: 'owner',
    relativeHandle: '@owner',
    avatar: null,
    instance: { kind: 'LOCAL' },
    viewerState: { blockedBy: false, isSelf: true, profileBlock: null, profileMute: null },
  },
});
const connection = (
  ids: string[],
  hasNextPage = false,
  isPinned: boolean | ((id: string) => boolean) = false,
) => ({
  edges: ids.map((id) => ({
    cursor: id,
    node: postNode(id, typeof isPinned === 'function' ? isPinned(id) : isPinned),
  })),
  pageInfo: {
    startCursor: ids[0] ?? null,
    endCursor: ids.at(-1) ?? null,
    hasNextPage,
    hasPreviousPage: false,
  },
});
const profile = (kind: string, pins: string[], posts: string[], postsHasNext = false) => ({
  __typename: 'Profile',
  id: 'owner',
  instance: { kind },
  viewerState: { profileBlock: null, profileMute: null },
  pinnedPosts: pins.map((id) => postNode(id, true)),
  posts: connection(posts, postsHasNext, (id) => pins.includes(id)),
});
async function respond(data: Record<string, unknown>) {
  await respondAt(requests.length - 1, data);
}
async function respondAt(index: number, data: Record<string, unknown>) {
  await act(async () => {
    requests[index]!.sink.next({ data });
    requests[index]!.sink.complete();
  });
}
const all = (type: string) => renderer!.root.findAll((node) => node.type === type);
const cards = () =>
  all('PostListItem').map((node) => [node.props.post.__id, Boolean(node.props.pinned)]);
it('Local shows every pin, permits chronology duplicates, and survives deleted records', async () => {
  const environment = await start();
  assert.deepEqual(
    requests.map((request) => request.name),
    ['ProfilePostListPageQuery'],
  );
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['first', 'second'], ['first']),
  });
  assert.deepEqual(cards(), [
    ['first', true],
    ['second', true],
    ['first', false],
  ]);
  await act(async () => environment.commitUpdate((store) => store.delete('first')));
  assert.deepEqual(cards(), [['second', true]]);
  assert.equal(all('StateView').length, 0);
  assert.equal(all('InfiniteList').length, 1);
  assert.equal(all('Button').length, 0);
});
it('pin and unpin immediately synchronize the pinned segment from the mutation response', async () => {
  activeActionPostId = 'first';
  const environment = await start();
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['second'], ['first', 'chronology']),
  });
  assert.equal(environment.check(rootQueryOperation).status, 'available');
  assert.deepEqual(cards(), [
    ['second', true],
    ['first', false],
    ['chronology', false],
  ]);
  assert.equal(all('ActionState')[0]!.props.item.label, '프로필에 고정');

  await act(async () => all('ActionState')[0]!.props.item.onSelect());
  assert.equal(requests[1]!.name, 'ProfilePinActionPinMutation');
  assert.equal(all('ModalSheet').length, 0);
  assert.equal(all('ActionState')[0]!.props.pending, true);
  await respondAt(1, {
    pinProfilePost: {
      changed: true,
      profile: {
        __typename: 'Profile',
        id: 'owner',
        pinnedPosts: [postNode('first', true), postNode('second', true)],
      },
      post: postNode('first', true),
    },
  });

  assert.equal(all('ActionState')[0]!.props.item.label, '프로필 고정 해제');
  assert.deepEqual(cards(), [
    ['first', true],
    ['second', true],
    ['first', false],
    ['chronology', false],
  ]);
  assert.equal(environment.check(rootQueryOperation).status, 'available');

  await act(async () => all('ActionState')[0]!.props.item.onSelect());
  await act(async () => all('ConfirmationContent')[0]!.props.onConfirm());
  await act(async () => all('ModalSheet')[0]!.props.onDismiss());
  assert.equal(requests[2]!.name, 'ProfilePinActionUnpinMutation');
  await respondAt(2, {
    unpinProfilePost: {
      changed: true,
      profile: {
        __typename: 'Profile',
        id: 'owner',
        pinnedPosts: [postNode('second', true)],
      },
      post: postNode('first', false),
    },
  });

  assert.equal(all('ActionState')[0]!.props.item.label, '프로필에 고정');
  assert.deepEqual(cards(), [
    ['second', true],
    ['first', false],
    ['chronology', false],
  ]);
  assert.deepEqual(
    requests.map((request) => request.name),
    ['ProfilePostListPageQuery', 'ProfilePinActionPinMutation', 'ProfilePinActionUnpinMutation'],
  );
  assert.equal(environment.check(rootQueryOperation).status, 'available');
});
it('ActivityPub displays the returned pin list without a pinned pagination control', async () => {
  await start();
  const pins = Array.from({ length: 20 }, (_, index) => `pin-${index}`);
  await respond({
    currentSession: null,
    profileByHandle: profile('ACTIVITYPUB', pins, ['chronology']),
  });
  assert.equal(all('InfiniteList').length, 1);
  assert.deepEqual(cards(), pins.map((id) => [id, true]).concat([['chronology', false]]));
  assert.equal(all('Button').length, 0);
});

for (const reduced of [false, true]) {
  it(`keeps pins and loading feedback while paginating with reduced motion ${reduced}`, async () => {
    reducedMotion = reduced;
    await start();
    const pins = Array.from({ length: 20 }, (_, index) => `pin-${index}`);
    await respond({
      currentSession: null,
      profileByHandle: profile('ACTIVITYPUB', pins, ['chronology-0'], true),
    });

    assert.equal(all('Button').length, 0);
    const list = all('InfiniteList')[0]!;
    await act(async () => list.props.loadNext(20));
    assert.equal(requests.at(-1)!.name, 'PostListProfileNextPageQuery');
    assert.equal(requests.at(-1)!.variables.cursor, 'chronology-0');
    assert.equal(all('InfiniteList')[0]!.props.isLoadingNext, true);
    assert.deepEqual(
      cards(),
      [...pins, 'chronology-0'].map((id, index) => [id, index < pins.length]),
    );
    assert.equal(all('ActivityIndicator').length, reduced ? 0 : 1);
    const indicator = all(reduced ? 'Text' : 'ActivityIndicator').find(
      (node) => node.props.accessibilityLabel === '게시글을 더 불러오는 중',
    );
    assert.ok(indicator);
    if (reduced) {
      assert.equal(indicator.props.children, '···');
      assert.equal(indicator.props.accessible, true);
    }
    const announcement = all('Text').find(
      (node) => node.props.accessibilityLiveRegion === 'polite',
    );
    assert.ok(announcement);
    assert.equal(announcement.props.children, '게시글을 더 불러오는 중입니다.');

    await respond({
      node: {
        __typename: 'Profile',
        id: 'owner',
        instance: { kind: 'ACTIVITYPUB' },
        posts: connection(['chronology-1']),
      },
    });

    assert.deepEqual(
      cards(),
      [...pins, 'chronology-0', 'chronology-1'].map((id, index) => [id, index < pins.length]),
    );
    assert.equal(all('InfiniteList')[0]!.props.isLoadingNext, false);
    assert.equal(all('ActivityIndicator').length, 0);
    assert.equal(
      all('Text').some((node) => node.props.accessibilityLabel === '게시글을 더 불러오는 중'),
      false,
    );
  });
}

it('moves pins immediately from the shared list action and retains chronology while pending and after response', async () => {
  const environment = await start();
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['first', 'second', 'third'], ['chronology']),
  });
  const menus = () =>
    all('PostListItem')
      .filter((node) => node.props.pinned)
      .map((node) => node.props.pinOrder);
  assert.deepEqual(
    menus().map((menu) => menu.items.map((item: { label: string }) => item.label)),
    [['아래로 이동'], ['위로 이동', '아래로 이동'], ['위로 이동']],
  );
  const chronology = environment.getStore().getSource().get('chronology');
  await act(async () => menus()[1].items[0].onSelect());
  assert.equal(requests.at(-1)!.name, 'ProfilePinOrderMutation');
  assert.deepEqual(requests.at(-1)!.variables, { postId: 'second', beforePostId: 'first' });
  assert.ok(
    menus().every(
      (menu) =>
        menu.pending &&
        menu.items.every(
          (item: { disabled: boolean; busy: boolean }) => item.disabled && item.busy,
        ),
    ),
  );
  await act(async () => menus()[0].items[0].onSelect());
  assert.equal(requests.length, 2);
  assert.deepEqual(
    cards().map((card) => card[0]),
    ['first', 'second', 'third', 'chronology'],
  );
  await respond({
    reorderProfilePost: {
      changed: true,
      profile: profile('LOCAL', ['second', 'first', 'third'], ['chronology']),
    },
  });
  assert.deepEqual(
    cards().map((card) => card[0]),
    ['second', 'first', 'third', 'chronology'],
  );
  assert.deepEqual(environment.getStore().getSource().get('chronology'), chronology);
  assert.ok(menus().every((menu) => !menu.pending));
  await act(async () => menus()[1].items[1].onSelect());
  assert.deepEqual(requests.at(-1)!.variables, { postId: 'first', beforePostId: null });
});

it('retains confirmed order on failure and allows retry', async () => {
  await start();
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['first', 'second', 'third'], []),
  });
  const first = () => all('PostListItem')[0]!.props.pinOrder;
  await act(async () => first().items[0].onSelect());
  assert.deepEqual(requests.at(-1)!.variables, { postId: 'first', beforePostId: 'third' });
  await act(async () => requests.at(-1)!.sink.error(new Error('offline')));
  assert.deepEqual(
    cards().map((card) => card[0]),
    ['first', 'second', 'third'],
  );
  assert.equal(toasts.length, 1);
  assert.match(toasts[0]!, /순서를 변경하지 못했어요/);
  assert.equal(first().pending, false);
  await act(async () => first().items[0].onSelect());
  assert.equal(requests.length, 3);
});

for (const [kind, actor, pins] of [
  ['LOCAL', 'owner', ['first']],
  ['ACTIVITYPUB', 'owner', ['first', 'second']],
  ['LOCAL', 'visitor', ['first', 'second']],
] as const) {
  it(`does not offer movement for ${kind}/${actor}/${pins.length} pins`, async () => {
    selectedProfileId = actor;
    await start();
    await respond({
      currentSession: null,
      profileByHandle: profile(kind, [...pins], ['chronology']),
    });
    assert.ok(
      all('PostListItem').every(
        (node) => node.props.pinOrder == null || node.props.pinOrder.items.length === 0,
      ),
    );
    assert.equal(requests.length, 1);
  });
}

it('a late old-actor reorder response does not change the next actor store or list', async () => {
  const oldEnvironment = await start();
  await respond({
    currentSession: null,
    profileByHandle: profile('LOCAL', ['first', 'second'], []),
  });
  await act(async () => all('PostListItem')[1]!.props.pinOrder.items[0].onSelect());
  await act(async () => renderer!.unmount());
  renderer = undefined;
  selectedProfileId = 'visitor';
  const nextEnvironment = await start();
  await respondAt(2, { currentSession: null, profileByHandle: profile('LOCAL', ['other'], []) });
  const nextBefore = nextEnvironment.getStore().getSource().toJSON();
  await respondAt(1, {
    reorderProfilePost: { changed: true, profile: profile('LOCAL', ['second', 'first'], []) },
  });
  assert.deepEqual(
    cards().map((card) => card[0]),
    ['other'],
  );
  assert.deepEqual(nextEnvironment.getStore().getSource().toJSON(), nextBefore);
  assert.deepEqual(oldEnvironment.getStore().getSource().get('owner')?.pinnedPosts, {
    __refs: ['second', 'first'],
  });
});
