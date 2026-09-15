import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import followFragment from './__generated__/FollowButton_profile.graphql';
import cancelMutation from './__generated__/FollowButtonCancelProfileFollowRequestMutation.graphql';
import followMutation from './__generated__/FollowButtonFollowProfileMutation.graphql';
import unfollowMutation from './__generated__/FollowButtonUnfollowProfileMutation.graphql';
import profileFragment from './__generated__/ProfileBlockAction_profile.graphql';
import blockFragment from './__generated__/ProfileBlockAction_profileBlock.graphql';
import blockMutation from './__generated__/ProfileBlockControllerBlockMutation.graphql';
import unblockMutation from './__generated__/ProfileBlockControllerUnblockMutation.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { RelayEnvironmentBoundary as BoundaryExport } from '../../relay/RelayEnvironmentBoundary';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type {
  ProfileBlockAction as BlockActionExport,
  ProfileBlockFeedback,
} from './ProfileBlockAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const artifacts = [
  followFragment,
  followMutation,
  cancelMutation,
  unfollowMutation,
  blockFragment,
  profileFragment,
  blockMutation,
  unblockMutation,
];
mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:mutation|fragment)\s+(\w+)/)?.[1];
    const artifact = artifacts.find(
      (item) => ('params' in item ? item.params.name : item.name) === name,
    );
    assert.ok(artifact, name);
    return artifact;
  },
});
mockModule('react-native', { StyleSheet: { create: (styles: object) => styles }, View: 'View' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/ConfirmationContent', { ConfirmationContent: 'ConfirmationContent' });
mockModule('@/components/ui/ModalSheet', { ModalSheet: 'ModalSheet' });
mockModule('@/analytics/client', { trackAnalytics: () => {} });
const toasts: string[] = [];
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (message: string) => toasts.push(message) }),
});
let selectedProfileId = 'owner-a';
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId }) });

const targetId = 'target-a';
const blockId = 'block-a';
const stateId = 'client:target-a:viewerState';
const generationRef = { current: 0 };
const feedback: ProfileBlockFeedback[] = [];
const requests: Array<{
  name: string;
  variables: unknown;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
}> = [];
let renderer: ReactTestRenderer | null = null;
let FollowButton: typeof FollowButtonExport;
let ProfileBlockAction: typeof BlockActionExport;
let RelayEnvironmentBoundary: typeof BoundaryExport;
let focusCount = 0;
const control = {
  focus: () => {
    focusCount += 1;
  },
};
before(async () => {
  ({ FollowButton } = await import('./FollowButton'));
  ({ ProfileBlockAction } = await import('./ProfileBlockAction'));
  ({ RelayEnvironmentBoundary } = await import('../../relay/RelayEnvironmentBoundary'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests.length = 0;
  toasts.length = 0;
  feedback.length = 0;
  selectedProfileId = 'owner-a';
  generationRef.current = 0;
  focusCount = 0;
});

function createEnvironment() {
  const environment = new Environment({
    network: Network.create((request, variables) =>
      Observable.create((sink) => {
        requests.push({ name: request.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
  environment.commitUpdate((store) => {
    const target = store.create(targetId, 'Profile');
    for (const [field, value] of Object.entries({
      id: targetId,
      displayName: '대상',
      handle: 'target',
      relativeHandle: '@target',
      followPolicy: 'OPEN',
      followersCount: 0,
    })) {
      target.setValue(value, field);
    }
    const state = store.create(stateId, 'ProfileViewerState');
    state.setValue(false, 'isSelf');
    state.setValue(null, 'follow');
    state.setValue(null, 'followRequest');
    const block = store.create(blockId, 'ProfileBlock');
    block.setValue(blockId, 'id');
    block.setLinkedRecord(target, 'targetProfile');
    state.setLinkedRecord(block, 'profileBlock');
    target.setLinkedRecord(state, 'viewerState');
    const connection = store.create(
      ConnectionHandler.getConnectionID(selectedProfileId, 'SettingsBlockedProfiles_profileBlocks'),
      'ProfileBlockConnection',
    );
    const edge = ConnectionHandler.createEdge(
      store,
      connection,
      block,
      'ProfileBlockConnectionEdge',
    );
    connection.setLinkedRecords([edge], 'edges');
    store.create('unrelated', 'Profile').setValue('보존', 'displayName');
  });
  return environment;
}

async function render(environment: Environment, showBlockAction = false) {
  const owner = createOperationDescriptor(followMutation, { id: targetId }).request;
  const tree = createElement(
    RelayEnvironmentBoundary,
    // The production RelayActorBoundary remounts its subtree on actor selection.
    { environment, generationRef, key: generationRef.current },
    createElement(FollowButton, {
      profile: {
        __id: targetId,
        __fragments: { FollowButton_profile: {} },
        __fragmentOwner: owner,
      } as never,
      onActionRef: (node) => {
        if (node) {
          assert.equal(node, control);
        }
      },
      onBlockFeedback: (result) => feedback.push(result),
    }),
    showBlockAction
      ? createElement(ProfileBlockAction, {
          nextBlocked: true,
          profile: {
            __id: targetId,
            __fragments: { ProfileBlockAction_profile: {} },
            __fragmentOwner: owner,
          } as never,
          surface: 'button',
          onFeedback: (result) => feedback.push(result),
        })
      : null,
  );
  await act(async () => {
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = create(tree, { createNodeMock: () => control });
    }
  });
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Button')
    .forEach((node) => node.props.controlRef?.(control));
}
function button() {
  return renderer!.root.find((node) => (node.type as unknown) === 'Button');
}
function modal() {
  return renderer!.root.find((node) => (node.type as unknown) === 'ModalSheet');
}
function confirmation() {
  return renderer!.root.find((node) => (node.type as unknown) === 'ConfirmationContent');
}
async function confirm() {
  await act(async () => button().props.onPress());
  await act(async () => confirmation().props.onConfirm());
}
async function respond(index: number, response: GraphQLResponse) {
  await act(async () => {
    requests[index]!.sink.next(response);
    requests[index]!.sink.complete();
  });
}

test('실제 FollowButton·Relay는 pending 중 중복과 닫기를 막고 실패 후 같은 관계를 재시도한다', async () => {
  const environment = createEnvironment();
  const store = environment.getStore();
  await render(environment);
  assert.equal(button().props.children, '차단 해제');
  await confirm();
  await act(async () => {
    confirmation().props.onConfirm();
    modal().props.onClose();
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0]!.variables, { id: blockId });
  assert.equal(confirmation().props.pending, true);
  assert.equal(modal().props.visible, true);
  assert.equal(modal().props.dismissDisabled, true);
  await act(async () => requests[0]!.sink.error(new Error('offline')));
  assert.equal(button().props.children, '차단 해제');
  assert.equal(modal().props.visible, false);
  assert.deepEqual(feedback, []);
  await act(async () => modal().props.onDismiss());
  assert.equal(focusCount, 1);
  assert.deepEqual(feedback, [{ blocked: false, status: 'error' }]);
  assert.ok(store.getSource().get(blockId));
  await confirm();
  await respond(1, { data: { unblockProfile: { success: true, profileBlockId: blockId } } });
  assert.equal(button().props.children, '팔로우');
  assert.equal(environment.getStore(), store);
  assert.equal(store.getSource().get(blockId), null);
  assert.equal(store.getSource().get(stateId)?.profileBlock, null);
  assert.equal(store.getSource().get('unrelated')?.displayName, '보존');
  assert.deepEqual(feedback, [
    { blocked: false, status: 'error' },
    { blocked: false, status: 'success' },
  ]);
});

test('실제 FollowButton의 늦은 A 응답은 B의 action·Store·피드백을 바꾸지 않는다', async () => {
  const actorA = createEnvironment();
  await render(actorA);
  await confirm();
  selectedProfileId = 'owner-b';
  generationRef.current += 1;
  const actorB = createEnvironment();
  await render(actorB);
  assert.equal(button().props.disabled, false);
  assert.equal(modal().props.visible, false);
  const before = actorB.getStore().getSource().toJSON();
  await respond(0, { data: { unblockProfile: { success: true, profileBlockId: blockId } } });
  assert.equal(button().props.children, '차단 해제');
  assert.equal(button().props.disabled, false);
  assert.deepEqual(actorB.getStore().getSource().toJSON(), before);
  assert.deepEqual(feedback, []);
  assert.deepEqual(toasts, []);
});

test('Block partial 오류 후 실제 FollowButton과 차단 action을 유지하고 재시도한다', async () => {
  const environment = createEnvironment();
  environment.commitUpdate((store) => {
    store.get(stateId)?.setValue(null, 'profileBlock');
    store
      .get(
        ConnectionHandler.getConnectionID(
          selectedProfileId,
          'SettingsBlockedProfiles_profileBlocks',
        ),
      )
      ?.setLinkedRecords([], 'edges');
  });
  await render(environment, true);
  const action = () =>
    renderer!.root.findAllByType(ProfileBlockAction).find((node) => node.props.nextBlocked)!;
  const actionControl = (type: string) => action().find((node) => (node.type as unknown) === type);
  const labels = () =>
    renderer!.root
      .findAll((node) => (node.type as unknown) === 'Button')
      .map((node) => node.props.children);
  const startBlock = async () => {
    await act(async () => actionControl('Button').props.onPress());
    await act(async () => actionControl('ConfirmationContent').props.onConfirm());
  };
  const payload = {
    blockProfile: {
      success: true,
      profileBlock: {
        id: blockId,
        targetProfile: {
          id: targetId,
          displayName: '대상',
          relativeHandle: '@target',
          viewerState: null,
        },
      },
    },
  };
  await startBlock();
  await respond(0, {
    data: payload,
    errors: [{ message: 'Partial response failed', path: ['blockProfile', 'profileBlock'] }],
  });
  assert.deepEqual(labels(), ['팔로우', '차단']);
  assert.deepEqual(environment.getStore().getSource().get(targetId)?.viewerState, {
    __ref: stateId,
  });
  assert.equal(actionControl('ModalSheet').props.visible, false);
  await act(async () => actionControl('ModalSheet').props.onDismiss());
  assert.deepEqual(feedback, [{ blocked: true, status: 'error' }]);
  await startBlock();
  await respond(1, { data: payload });
  assert.deepEqual(labels(), ['차단 해제', '차단']);
  assert.equal(environment.getStore().getSource().get(stateId)?.profileBlock?.__ref, blockId);
  await act(async () => actionControl('ModalSheet').props.onDismiss());
  assert.deepEqual(feedback, [
    { blocked: true, status: 'error' },
    { blocked: true, status: 'success' },
  ]);
});
