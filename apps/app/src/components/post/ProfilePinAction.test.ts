import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ProfilePinAction_post$data } from './__generated__/ProfilePinAction_post.graphql';
import type { useProfilePinAction as useProfilePinActionType } from './ProfilePinAction';

const profileId = 'profile-pin-owner';
const actionPostId = 'post-pin-action';
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const requests: Array<Record<string, unknown>> = [];
const profilePinState = {
  available: true,
  firstPinnedPostId: null as string | null,
  pending: false,
  queryFailed: false,
};
const sessionState = { selectedProfileId: profileId as string | null };
let retryCount = 0;
let renderer: ReactTestRenderer | null = null;
let useProfilePinAction: typeof useProfilePinActionType;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/fragment (\w+)/)?.[1];
    assert.equal(name, 'ProfilePinAction_post');
    return require('./__generated__/ProfilePinAction_post.graphql.ts').default;
  },
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('lucide-react-native', { Pin: 'Pin' });
mockModule(require.resolve('lucide-react-native'), { Pin: 'Pin' });
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('@/session/SessionProvider', {
  useSession: () => sessionState,
});
mockModule('./ProfilePinProvider', {
  useProfilePin: () => ({
    ...profilePinState,
    request: (request: Record<string, unknown>) => requests.push(request),
    retry: () => {
      retryCount += 1;
    },
  }),
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
  requests.length = 0;
  profilePinState.available = true;
  profilePinState.firstPinnedPostId = null;
  profilePinState.pending = false;
  profilePinState.queryFailed = false;
  sessionState.selectedProfileId = profileId;
  retryCount = 0;
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

function ActionHarness({ post }: { post: ProfilePinAction_post$data }) {
  const action = useProfilePinAction(post as never, () => undefined);
  return createElement('ActionState', action, action.confirmation);
}

const actionPost: ProfilePinAction_post$data = {
  id: actionPostId,
  state: 'ACTIVE',
  visibility: 'PUBLIC',
  content: { id: 'content-pin-action' },
  repostSource: null,
  profile: { id: profileId, instance: { kind: 'LOCAL' } },
  ' $fragmentType': 'ProfilePinAction_post',
};

function actionState(): ReactTestInstance {
  assert.ok(renderer);
  const state = renderer.root.findAll((node) => String(node.type) === 'ActionState')[0];
  assert.ok(state);
  return state;
}

function modal(): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ModalSheet')[0];
  assert.ok(instance);
  return instance;
}

function confirmation(): ReactTestInstance {
  assert.ok(renderer);
  const instance = renderer.root.findAll((node) => String(node.type) === 'ConfirmationContent')[0];
  assert.ok(instance);
  return instance;
}

async function renderAction(post: ProfilePinAction_post$data = actionPost) {
  await act(async () => {
    renderer = create(createElement(ActionHarness, { post }));
  });
}

describe('ProfilePinAction interaction lifecycle', () => {
  it('confirms pin, cancels without a request, and restores trigger focus', async () => {
    await renderAction();
    let focusCount = 0;
    actionState().props.onMoreTriggerReady(() => {
      focusCount += 1;
    });

    await act(async () => actionState().props.item.onSelect());
    assert.equal(modal().props.title, '프로필에 고정할까요?');
    assert.equal(confirmation().props.confirmLabel, '고정');
    await act(async () => confirmation().props.onCancel());
    await act(async () => modal().props.onDismiss());
    assert.equal(requests.length, 0);
    assert.equal(focusCount, 1);
  });

  it('requests a pin only after confirmation and dismissal', async () => {
    await renderAction();
    await act(async () => actionState().props.item.onSelect());
    await act(async () => confirmation().props.onConfirm());
    assert.equal(requests.length, 0);
    await act(async () => modal().props.onDismiss());
    assert.deepEqual(requests, [{ kind: 'pin', postId: actionPostId }]);
  });

  it('requests replacement in unpin then pin order through the shared owner', async () => {
    profilePinState.firstPinnedPostId = 'post-pin-existing';
    await renderAction();
    await act(async () => actionState().props.item.onSelect());
    assert.equal(modal().props.title, '고정 게시글을 바꿀까요?');
    assert.equal(confirmation().props.message, '기존 고정을 해제하고 이 게시글을 고정해요.');
    await act(async () => confirmation().props.onConfirm());
    await act(async () => modal().props.onDismiss());
    assert.deepEqual(requests, [
      { existingPostId: 'post-pin-existing', kind: 'replace', postId: actionPostId },
    ]);
  });

  it('passes direct unpin completion to the owner and keeps other posts enabled', async () => {
    profilePinState.firstPinnedPostId = actionPostId;
    await renderAction();
    await act(async () => actionState().props.item.onSelect());
    await act(async () => confirmation().props.onConfirm());
    await act(async () => modal().props.onDismiss());
    assert.equal(requests[0]?.kind, 'unpin');
    assert.equal(requests[0]?.postId, actionPostId);
    assert.equal(typeof requests[0]?.onCompleted, 'function');

    profilePinState.pending = true;
    await renderAction({
      ...actionPost,
      profile: { id: 'other-profile', instance: { kind: 'LOCAL' } },
    });
    assert.equal(actionState().props.item, undefined);
    assert.equal(actionState().props.pending, false);
  });

  it('shows query retry only for an eligible own post', async () => {
    profilePinState.available = false;
    profilePinState.queryFailed = true;
    await renderAction();
    assert.equal(actionState().props.item?.label, '고정 상태 다시 불러오기');
    await act(async () => actionState().props.item.onSelect());
    assert.equal(retryCount, 1);
    assert.equal(requests.length, 0);

    await renderAction({
      ...actionPost,
      profile: { id: 'other-profile', instance: { kind: 'LOCAL' } },
    });
    assert.equal(actionState().props.item, undefined);

    sessionState.selectedProfileId = null;
    await renderAction();
    assert.equal(actionState().props.item, undefined);
  });
});
