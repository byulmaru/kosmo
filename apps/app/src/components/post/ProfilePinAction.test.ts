import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
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
import pinFragment from './__generated__/ProfilePinAction_post.graphql';
import pinMutation from './__generated__/ProfilePinActionPinMutation.graphql';
import unpinMutation from './__generated__/ProfilePinActionUnpinMutation.graphql';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { useProfilePinAction as useProfilePinActionType } from './ProfilePinAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profileA = 'profile-pin-owner-a';
const profileB = 'profile-pin-owner-b';
const require = createRequire(import.meta.url);
const requests: Array<{
  name: string;
  sink: { next(response: GraphQLResponse): void; complete(): void; error(error: Error): void };
  variables: Variables;
}> = [];
const toasts: string[] = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const artifacts = [pinFragment, pinMutation, unpinMutation];
let selectedProfileId = profileA;
let renderer: ReactTestRenderer | null = null;
let useProfilePinAction: typeof useProfilePinActionType;

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:mutation|fragment)\s+(\w+)/)?.[1];
    const artifact = artifacts.find(
      (item) => ('params' in item ? item.params.name : item.name) === name,
    );
    assert.ok(artifact, `missing Relay artifact for ${name}`);
    return artifact;
  },
});
mockModule('react-native', { View: 'View' });
mockModule('lucide-react-native', { Pin: 'Pin' });
mockModule(require.resolve('lucide-react-native'), { Pin: 'Pin' });
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId }) });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (message: string) => toasts.push(message) }),
});
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ConfirmationContent', props, children),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});

before(async () => {
  ({ useProfilePinAction } = await import('./ProfilePinAction'));
});

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  requests.length = 0;
  toasts.length = 0;
  selectedProfileId = profileA;
});

function createEnvironment(targetRequests = requests) {
  return new Environment({
    network: Network.create((request: RequestParameters, variables: Variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        targetRequests.push({ name: request.name, sink, variables });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function seedPost(environment: Environment, postId: string, profileId: string, isPinned: boolean) {
  environment.commitUpdate((store) => {
    const profile = store.get(profileId) ?? store.create(profileId, 'Profile');
    profile.setValue(profileId, 'id');
    profile.setValue(profileId === profileA ? '@pin-owner-a' : '@pin-owner-b', 'relativeHandle');
    const instance =
      store.get(`${profileId}:instance`) ??
      store.create(`${profileId}:instance`, 'ProfileInstance');
    instance.setValue('LOCAL', 'kind');
    profile.setLinkedRecord(instance, 'instance');
    const content = store.create(`${postId}:content`, 'PostContent');
    content.setValue(`${postId}:content`, 'id');
    const post = store.create(postId, 'Post');
    post.setValue(postId, 'id');
    post.setValue(isPinned, 'isPinned');
    post.setValue('ACTIVE', 'state');
    post.setValue('PUBLIC', 'visibility');
    post.setLinkedRecord(content, 'content');
    post.setLinkedRecord(profile, 'profile');
  });
}

function fragmentRef(postId: string): ProfilePinAction_post$key {
  const owner = createOperationDescriptor(getRequest(pinMutation), { postId }).request;
  return {
    __id: postId,
    __fragments: { ProfilePinAction_post: {} },
    __fragmentOwner: owner,
  } as unknown as ProfilePinAction_post$key;
}

function ActionHarness({ postId }: { postId: string }) {
  const action = useProfilePinAction(fragmentRef(postId));
  return createElement('ActionState', { postId, ...action }, action.confirmation);
}

async function render(environment: Environment, postIds: string[]) {
  const children = postIds.map((postId) => createElement(ActionHarness, { key: postId, postId }));
  const tree = createElement(ReactRelay.RelayEnvironmentProvider, {
    children,
    environment,
    key: selectedProfileId,
  });
  await act(async () => {
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = create(tree);
    }
  });
}

function actions(): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => String(node.type) === 'ActionState');
}

function modal(index = 0): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ModalSheet')[index];
  assert.ok(instance);
  return instance;
}

function confirmation(index = 0): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ConfirmationContent')[
    index
  ];
  assert.ok(instance);
  return instance;
}

async function pin(index = 0) {
  await act(async () => actions()[index]!.props.item.onSelect());
}

async function unpin(index = 0) {
  await act(async () => actions()[index]!.props.item.onSelect());
  await act(async () => confirmation().props.onConfirm());
  await act(async () => modal().props.onDismiss());
}

async function respond(index: number, response: GraphQLResponse, targetRequests = requests) {
  await act(async () => {
    targetRequests[index]!.sink.next(response);
    targetRequests[index]!.sink.complete();
  });
}

function mutationResponse(
  field: 'pinProfilePost' | 'unpinProfilePost',
  postId: string,
  profileId: string,
  isPinned: boolean | null,
  pinnedPostIds: string[] = isPinned ? [postId] : [],
): GraphQLResponse {
  return {
    data: {
      [field]: {
        changed: true,
        profile: {
          __typename: 'Profile',
          id: profileId,
          pinnedPosts: pinnedPostIds.map((id) =>
            pinPostData(id, profileId, id === postId ? isPinned : true),
          ),
        },
        post: pinPostData(postId, profileId, isPinned),
      },
    },
    ...(isPinned === null
      ? {
          errors: [
            {
              message: 'pin projection failed',
              path: [field, 'post', 'isPinned'],
            },
          ],
        }
      : {}),
  };
}

function pinPostData(postId: string, profileId: string, isPinned: boolean | null) {
  return {
    __typename: 'Post',
    id: postId,
    isPinned,
    state: 'ACTIVE',
    visibility: 'PUBLIC',
    createdAt: '2026-09-30T00:00:00Z',
    content: {
      __typename: 'PostContent',
      id: `${postId}:content`,
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
    profile: {
      __typename: 'Profile',
      id: profileId,
      avatar: null,
      displayName: profileId === profileA ? 'Owner A' : 'Owner B',
      handle: profileId,
      relativeHandle: profileId === profileA ? '@pin-owner-a' : '@pin-owner-b',
      instance: { kind: 'LOCAL' },
      viewerState: { profileMute: null },
    },
    replyParent: null,
    repostSource: null,
    repostCount: 0,
    viewerBookmark: null,
    viewerRepost: null,
    viewerReactions: [],
    reactionCounts: [],
  };
}

test('실제 Relay mutation은 게시물별 메뉴 상태를 갱신하고 고정된 다른 게시물 상태를 보존한다', async () => {
  const environment = createEnvironment();
  seedPost(environment, 'post-a', profileA, false);
  seedPost(environment, 'post-b', profileA, false);
  await render(environment, ['post-a', 'post-b']);

  assert.equal(actions()[0]!.props.item.label, '프로필에 고정');
  assert.equal(actions()[1]!.props.item.label, '프로필에 고정');
  await pin(0);
  assert.equal(requests[0]?.name, 'ProfilePinActionPinMutation');
  assert.deepEqual(requests[0]?.variables, { postId: 'post-a' });
  assert.equal(actions()[0]!.props.confirmation, null);
  assert.equal(actions()[0]!.props.pending, true);
  assert.equal(actions()[1]!.props.pending, false);
  await act(async () => actions()[0]!.props.item.onSelect());
  assert.equal(requests.length, 1);

  await pin(1);
  assert.equal(requests[1]?.name, 'ProfilePinActionPinMutation');
  assert.deepEqual(requests[1]?.variables, { postId: 'post-b' });
  await respond(0, mutationResponse('pinProfilePost', 'post-a', profileA, true, ['post-a']));
  assert.equal(actions()[0]!.props.item.label, '프로필 고정 해제');
  assert.equal(actions()[1]!.props.item.label, '프로필에 고정');
  await respond(
    1,
    mutationResponse('pinProfilePost', 'post-b', profileA, true, ['post-a', 'post-b']),
  );

  await act(async () => {
    renderer!.update(
      createElement(ReactRelay.RelayEnvironmentProvider, {
        children: createElement(ActionHarness, {
          key: 'post-a',
          postId: 'post-a',
        }),
        environment,
        key: selectedProfileId,
      }),
    );
  });
  await unpin();
  assert.equal(requests[2]?.name, 'ProfilePinActionUnpinMutation');
  await respond(2, mutationResponse('unpinProfilePost', 'post-a', profileA, false, ['post-b']));
  assert.equal(actions()[0]!.props.item.label, '프로필에 고정');
  assert.equal(requests.length, 3);
  const source = environment.getStore().getSource();
  assert.equal(source.get('post-a')?.isPinned, false);
  assert.equal(source.get('post-b')?.isPinned, true);
  assert.deepEqual(toasts, []);
});

test('durable pin success with an unreadable projection hides only the pin action', async () => {
  const environment = createEnvironment();
  seedPost(environment, 'post-retry', profileA, false);
  await render(environment, ['post-retry']);
  await pin();
  await respond(
    0,
    mutationResponse('pinProfilePost', 'post-retry', profileA, null, ['post-retry']),
  );

  assert.equal(actions()[0]!.props.item, undefined);
  assert.deepEqual(toasts, []);
  assert.equal(requests.length, 1);
});

test('null mutation data clears pending state and preserves the cached pin status', async () => {
  const environment = createEnvironment();
  seedPost(environment, 'post-null-data', profileA, false);
  await render(environment, ['post-null-data']);

  await pin();
  assert.equal(actions()[0]!.props.pending, true);
  await respond(0, {
    data: null,
    errors: [{ message: 'profile projection failed' }],
  } as unknown as GraphQLResponse);

  assert.equal(actions()[0]!.props.pending, false);
  assert.equal(actions()[0]!.props.item.label, '프로필에 고정');
  assert.equal(environment.getStore().getSource().get('post-null-data')?.isPinned, false);
  assert.deepEqual(toasts, ['@pin-owner-a의 고정 상태를 변경하지 못했어요. 다시 시도해 주세요.']);
});

test('unpin remains pending until failure, then keeps the pin and allows retry', async () => {
  const environment = createEnvironment();
  seedPost(environment, 'post-unpin-failure', profileA, true);
  await render(environment, ['post-unpin-failure']);

  await unpin();
  assert.equal(requests[0]?.name, 'ProfilePinActionUnpinMutation');
  assert.equal(actions()[0]!.props.pending, true);
  await act(async () => actions()[0]!.props.item.onSelect());
  assert.equal(requests.length, 1);

  await act(async () => requests[0]!.sink.error(new Error('offline')));
  assert.equal(actions()[0]!.props.pending, false);
  assert.equal(actions()[0]!.props.item.label, '프로필 고정 해제');
  assert.equal(environment.getStore().getSource().get('post-unpin-failure')?.isPinned, true);
  assert.deepEqual(toasts, ['@pin-owner-a의 고정 상태를 변경하지 못했어요. 다시 시도해 주세요.']);

  await unpin();
  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.name, 'ProfilePinActionUnpinMutation');
});

test('unpin 취소는 mutation을 보내지 않고 메뉴 트리거로 focus를 돌려준다', async () => {
  const environment = createEnvironment();
  seedPost(environment, 'post-cancel', profileA, true);
  await render(environment, ['post-cancel']);
  let focused = 0;
  actions()[0]!.props.onMoreTriggerReady(() => (focused += 1));

  await act(async () => actions()[0]!.props.item.onSelect());
  await act(async () => confirmation().props.onCancel());
  await act(async () => modal().props.onDismiss());

  assert.equal(requests.length, 0);
  assert.equal(focused, 1);
  assert.equal(actions()[0]!.props.item.label, '프로필 고정 해제');
});

test('actor 전환 뒤 늦은 응답은 이전 Relay store와 요청 시점 작성자 handle을 사용한다', async () => {
  const requestsA: typeof requests = [];
  const environmentA = createEnvironment(requestsA);
  seedPost(environmentA, 'post-a-success', profileA, false);
  seedPost(environmentA, 'post-a-error', profileA, false);
  const environmentB = createEnvironment();
  seedPost(environmentB, 'post-b', profileB, false);
  await render(environmentA, ['post-a-success', 'post-a-error']);
  await pin(0);
  await pin(1);

  selectedProfileId = profileB;
  await render(environmentB, ['post-b']);
  await respond(0, mutationResponse('pinProfilePost', 'post-a-success', profileA, true), requestsA);
  await act(async () => requestsA[1]!.sink.error(new Error('offline')));

  assert.equal(environmentA.getStore().getSource().get('post-a-success')?.isPinned, true);
  assert.equal(environmentB.getStore().getSource().get('post-b')?.isPinned, false);
  assert.equal(actions()[0]!.props.item.label, '프로필에 고정');
  assert.deepEqual(toasts, ['@pin-owner-a의 고정 상태를 변경하지 못했어요. 다시 시도해 주세요.']);
});
