import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import profileQuery from '../../app/(tabs)/(profile)/[profileHandle]/__generated__/ProfileLayoutQuery.graphql';
import followFragment from './__generated__/FollowButton_profile.graphql';
import cancelMutation from './__generated__/FollowButtonCancelProfileFollowRequestMutation.graphql';
import followMutation from './__generated__/FollowButtonFollowProfileMutation.graphql';
import unfollowMutation from './__generated__/FollowButtonUnfollowProfileMutation.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type {
  FollowButton as FollowButtonExport,
  FollowButtonGroup as FollowButtonGroupExport,
} from './FollowButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const artifacts = [followFragment, followMutation, cancelMutation, unfollowMutation];
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
mockModule(new URL('./ProfileBlockAction.tsx', import.meta.url), {
  ProfileBlockAction: 'ProfileBlockAction',
});
const analytics: Array<{ event: string; properties: unknown }> = [];
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: unknown) => analytics.push({ event, properties }),
});
const toasts: string[] = [];
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (message: string) => toasts.push(message) }),
});
let selectedProfileId = 'owner-a';
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId }) });

type FollowPolicy = 'OPEN' | 'APPROVAL_REQUIRED';
type Relationship = 'none' | 'follow' | 'request';
const targetId = 'target-a';
const stateId = `client:${targetId}:viewerState`;
const requestId = 'request-a';
const requests: Array<{
  name: string;
  variables: unknown;
  sink: { next(value: GraphQLResponse): void; complete(): void; error(error: Error): void };
}> = [];
let renderer: ReactTestRenderer | null = null;
let FollowButton: typeof FollowButtonExport;
let FollowButtonGroup: typeof FollowButtonGroupExport;
before(async () => {
  ({ FollowButton, FollowButtonGroup } = await import('./FollowButton'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests.length = 0;
  toasts.length = 0;
  analytics.length = 0;
  selectedProfileId = 'owner-a';
});

function createEnvironment(followPolicy: FollowPolicy = 'OPEN') {
  const environment = new Environment({
    network: Network.create((request, variables) =>
      Observable.create((sink) => {
        requests.push({ name: request.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
  environment.commitUpdate((store) => {
    const actor = store.create(selectedProfileId, 'Profile');
    actor.setValue(selectedProfileId, 'id');
    actor.setValue(2, 'followingCount');
    const session = store.create('session-a', 'Session');
    session.setLinkedRecord(actor, 'selectedProfile');
    store.getRoot().setLinkedRecord(session, 'currentSession');
    const target = store.create(targetId, 'Profile');
    for (const [field, value] of Object.entries({
      id: targetId,
      displayName: '대상',
      handle: 'target',
      relativeHandle: '@target',
      followPolicy,
      followersCount: 4,
    })) {
      target.setValue(value, field);
    }
    const state = store.create(stateId, 'ProfileViewerState');
    state.setValue(false, 'isSelf');
    state.setValue(null, 'follow');
    state.setValue(null, 'followRequest');
    state.setValue(null, 'profileBlock');
    target.setLinkedRecord(state, 'viewerState');
    store.create('unrelated', 'Profile').setValue('보존', 'displayName');
  });
  return environment;
}

async function render(
  environment: Environment,
  panel: string | null,
  grouped = true,
  disabled = false,
  renderLoading = false,
) {
  const owner = createOperationDescriptor(profileQuery, { handle: 'target' }).request;
  const button = panel
    ? createElement(FollowButton, {
        key: panel,
        profile: {
          __id: targetId,
          __fragments: { FollowButton_profile: {} },
          __fragmentOwner: owner,
        } as never,
      })
    : null;
  const tree = createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    // The standalone first-profile flow keeps its tree while the Environment changes.
    children: grouped
      ? createElement(FollowButtonGroup, {
          disabled,
          children: renderLoading
            ? (loading: boolean) => createElement('GroupContent', { loading }, button)
            : button,
        })
      : button,
  });
  await act(async () => {
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = create(tree);
    }
  });
}

function button() {
  return renderer!.root.find((node) => (node.type as unknown) === 'Button');
}

async function press() {
  await act(async () => button().props.onPress());
}

async function respond(index: number, response: GraphQLResponse) {
  await act(async () => {
    requests[index]!.sink.next(response);
    requests[index]!.sink.complete();
  });
}

function followeePayload(followPolicy: FollowPolicy, relationship: Relationship, actorId: string) {
  return {
    id: targetId,
    displayName: '대상',
    handle: 'target',
    relativeHandle: '@target',
    followPolicy,
    followersCount: relationship === 'follow' ? 5 : 4,
    viewerState: {
      isSelf: false,
      follow:
        relationship === 'follow'
          ? { id: 'follow-a', follower: { id: actorId, followingCount: 3 } }
          : null,
      followRequest: relationship === 'request' ? { id: requestId } : null,
      profileBlock: null,
    },
  };
}

function followPayload(followPolicy: FollowPolicy, actorId = selectedProfileId) {
  const isRequest = followPolicy === 'APPROVAL_REQUIRED';
  return {
    followProfile: {
      result: {
        __typename: isRequest ? 'ProfileFollowRequest' : 'ProfileFollow',
        id: isRequest ? requestId : 'follow-a',
      },
      followerProfile: { id: actorId, followingCount: isRequest ? 2 : 3 },
      followeeProfile: followeePayload(followPolicy, isRequest ? 'request' : 'follow', actorId),
    },
  };
}

for (const followPolicy of ['OPEN', 'APPROVAL_REQUIRED'] as const) {
  const relationshipLabel = followPolicy === 'OPEN' ? '팔로잉' : '요청됨';
  test(`${followPolicy} 관계 action은 태그·패널 재마운트 후에도 중복을 막고 같은 normalized 상태로 수렴한다`, async () => {
    const environment = createEnvironment(followPolicy);
    const store = environment.getStore();
    await render(environment, 'tag-a');
    await press();
    assert.deepEqual(requests[0]!.variables, { id: targetId });
    assert.equal(button().props.accessibilityState.busy, true);
    assert.equal(button().props.children, relationshipLabel);

    // A failed panel can disappear while the action owner stays mounted.
    await render(environment, null);
    await render(environment, 'tag-b');
    assert.equal(button().props.disabled, true);
    assert.equal(button().props.accessibilityState.busy, true);
    await press();
    assert.equal(requests.length, 1);
    await respond(0, { data: followPayload(followPolicy) });
    assert.equal(button().props.disabled, false);
    assert.equal(button().props.children, relationshipLabel);
    assert.equal(environment.getStore(), store);
    assert.equal(store.getSource().get(targetId)?.followersCount, followPolicy === 'OPEN' ? 5 : 4);
    assert.equal(
      store.getSource().get(selectedProfileId)?.followingCount,
      followPolicy === 'OPEN' ? 3 : 2,
    );
    assert.deepEqual(analytics, [
      {
        event: 'follow_succeeded',
        properties: {
          result: followPolicy === 'OPEN' ? 'follow' : 'request',
          selected_profile_id: 'owner-a',
        },
      },
    ]);

    await render(environment, 'tag-c');
    assert.equal(button().props.children, relationshipLabel);
    await press();
    assert.equal(
      requests[1]!.name,
      followPolicy === 'OPEN'
        ? 'FollowButtonUnfollowProfileMutation'
        : 'FollowButtonCancelProfileFollowRequestMutation',
    );
    assert.deepEqual(requests[1]!.variables, {
      id: followPolicy === 'OPEN' ? targetId : requestId,
    });
    await render(environment, 'tag-d');
    assert.equal(button().props.disabled, true);
    await press();
    assert.equal(requests.length, 2);
    await act(async () => requests[1]!.sink.error(new Error('offline')));
    assert.equal(button().props.disabled, false);
    assert.equal(button().props.children, relationshipLabel);
    assert.deepEqual(toasts, ['팔로우 상태를 변경하지 못했습니다.']);

    await press();
    await respond(2, {
      data:
        followPolicy === 'OPEN'
          ? {
              unfollowProfile: {
                followerProfile: { id: selectedProfileId, followingCount: 2 },
                followeeProfile: followeePayload(followPolicy, 'none', selectedProfileId),
              },
            }
          : { cancelProfileFollowRequest: { profileFollowRequestId: requestId } },
    });
    assert.equal(button().props.disabled, false);
    assert.equal(button().props.children, '팔로우');
    assert.equal(store.getSource().get(targetId)?.followersCount, 4);
    assert.equal(store.getSource().get(selectedProfileId)?.followingCount, 2);
    assert.equal(store.getSource().get('unrelated')?.displayName, '보존');
    await press();
    assert.equal(requests.length, 4);
    assert.equal(requests[3]!.name, 'FollowButtonFollowProfileMutation');
  });

  test(`${followPolicy} 팔로우 실패는 새 태그의 버튼에서도 낙관적 상태를 되돌리고 재시도한다`, async () => {
    const environment = createEnvironment(followPolicy);
    await render(environment, 'tag-a');
    await press();
    await render(environment, 'tag-b');
    await act(async () => requests[0]!.sink.error(new Error('offline')));
    assert.equal(button().props.disabled, false);
    assert.equal(button().props.children, '팔로우');
    assert.equal(environment.getStore().getSource().get(targetId)?.followersCount, 4);
    assert.equal(environment.getStore().getSource().get(selectedProfileId)?.followingCount, 2);
    assert.deepEqual(toasts, ['팔로우 상태를 변경하지 못했습니다.']);
    assert.deepEqual(analytics, []);
    await press();
    assert.equal(requests.length, 2);
    await respond(1, { data: followPayload(followPolicy) });
    assert.equal(button().props.disabled, false);
    assert.equal(button().props.children, relationshipLabel);
  });
}

test('actor A의 늦은 응답은 actor B의 진행 중 action과 Store를 변경하지 않는다', async () => {
  const actorA = createEnvironment();
  await render(actorA, 'tag-a');
  await press();
  selectedProfileId = 'owner-b';
  const actorB = createEnvironment('APPROVAL_REQUIRED');
  await render(actorB, 'tag-a');
  assert.equal(button().props.disabled, false);
  assert.equal(button().props.children, '팔로우');
  await press();
  const before = structuredClone(actorB.getStore().getSource().toJSON());
  await respond(0, { data: followPayload('OPEN', 'owner-a') });
  assert.equal(button().props.disabled, true);
  assert.equal(button().props.children, '요청됨');
  assert.deepEqual(actorB.getStore().getSource().toJSON(), before);
  await press();
  assert.equal(requests.length, 2);
  await respond(1, { data: followPayload('APPROVAL_REQUIRED', 'owner-b') });
  assert.equal(button().props.disabled, false);
  assert.equal(button().props.children, '요청됨');
  assert.equal(actorB.getStore().getSource().get('owner-b')?.followingCount, 2);
  assert.deepEqual(toasts, []);
});

test('그룹 밖 FollowButton은 기존 독립 action lifecycle을 유지한다', async () => {
  const environment = createEnvironment();
  await render(environment, 'standalone', false);
  await press();
  assert.equal(button().props.disabled, true);
  await press();
  assert.equal(requests.length, 1);
  await respond(0, { data: followPayload('OPEN') });
  assert.equal(button().props.disabled, false);
  assert.equal(button().props.children, '팔로잉');
});

test('그룹의 외부 비활성화는 mutation을 시작하지 않고 실제 loading과 구분한다', async () => {
  const environment = createEnvironment();
  await render(environment, 'tag-a', true, true, true);
  assert.equal(button().props.disabled, true);
  assert.equal(button().props.accessibilityState.disabled, true);
  assert.equal(button().props.accessibilityState.busy, false);
  assert.equal(renderer!.root.findByType('GroupContent' as never).props.loading, false);
  await press();
  assert.equal(requests.length, 0);
  await render(environment, 'tag-a', true, false, true);
  assert.equal(button().props.disabled, false);
  await press();
  assert.equal(requests.length, 1);
  assert.equal(button().props.accessibilityState.busy, true);
  assert.equal(renderer!.root.findByType('GroupContent' as never).props.loading, true);
  await render(environment, 'tag-a', true, true, true);
  await respond(0, { data: followPayload('OPEN') });
  assert.equal(button().props.children, '팔로잉');
  assert.equal(button().props.disabled, true);
  assert.equal(button().props.accessibilityState.busy, false);
  assert.equal(renderer!.root.findByType('GroupContent' as never).props.loading, false);
  await press();
  assert.equal(requests.length, 1);
  await render(environment, 'tag-a', true, false, true);
  await press();
  assert.equal(requests[1]?.name, 'FollowButtonUnfollowProfileMutation');
});
