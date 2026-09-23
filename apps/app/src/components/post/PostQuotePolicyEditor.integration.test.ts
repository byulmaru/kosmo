import assert from 'node:assert/strict';
import { afterEach, before, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import Mutation from './__generated__/PostQuotePolicyEditorMutation.graphql';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostQuotePolicyEditor as Editor } from './PostQuotePolicyEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-relay', { ...ReactRelay, graphql: () => Mutation });
mockModule('react-native', { Platform: { OS: 'web' }, Text: 'Text' });
mockModule('./postVisibilityPresentation', {
  postVisibilityPresentation: { PUBLIC: { label: '공개' } },
});
mockModule('expo-secure-store', {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async () => null,
  isAvailableAsync: async () => false,
});
mockModule('@/components/Splash', { Splash: () => null });
mockModule('@/components/ui/ModalSheet', { ModalSheet: 'ModalSheet' });
mockModule('@/components/ui/RadioGroup', { RadioGroup: 'RadioGroup', RadioOption: 'RadioOption' });
mockModule('@/observability/sentry', { captureHandledMessage: () => undefined });
mockModule('@/theme/ThemeProvider', { useTheme: () => ({}) });

let PostQuotePolicyEditor: typeof Editor;
let RelayActorProvider: ComponentType<PropsWithChildren<{ createEnvironment: () => Environment }>>;
let RelayActorBoundary: ComponentType<PropsWithChildren>;
let useRelayActor: () => { resetActor: (profileId: string) => void };
let resetActor: (profileId: string) => void;
let renderer: ReactTestRenderer | undefined;
let requests: Array<{
  variables: Record<string, unknown>;
  sink: {
    next: (payload: GraphQLResponse) => void;
    complete: () => void;
    error: (error: Error) => void;
  };
}> = [];
let environments: Environment[] = [];
const postId = 'post:quote-policy';

before(async () => {
  ({ PostQuotePolicyEditor } = await import('./PostQuotePolicyEditor'));
  ({ RelayActorProvider, RelayActorBoundary, useRelayActor } =
    await import('@/relay/RelayActorProvider'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => requests.forEach(({ sink }) => sink.complete()));
  renderer = undefined;
  requests = [];
  environments = [];
});

function createEnvironment() {
  const environment = new Environment({
    network: Network.create((_operation, variables) =>
      Observable.create((sink) => {
        requests.push({ variables, sink });
      }),
    ),
    store: new Store(
      new RecordSource({
        [postId]: { __id: postId, __typename: 'Post', id: postId, quotePolicy: 'EVERYONE' },
      }),
    ),
  });
  environments.push(environment);
  return environment;
}

function Surface() {
  const [open, setOpen] = useState(true);
  resetActor = useRelayActor().resetActor;
  return open
    ? createElement(PostQuotePolicyEditor, {
        onClose: () => setOpen(false),
        policy: 'EVERYONE',
        postId,
        visibility: 'PUBLIC',
      })
    : null;
}

async function render() {
  await act(async () => {
    renderer = create(
      createElement(
        RelayActorProvider,
        { createEnvironment },
        createElement(RelayActorBoundary, null, createElement(Surface)),
      ),
    );
  });
}

const radio = () => renderer!.root.findByType('RadioGroup' as never);
const modal = () => renderer!.root.findByType('ModalSheet' as never);
const alerts = () => renderer!.root.findAllByProps({ accessibilityRole: 'alert' });
const choose = (policy: string) => act(async () => radio().props.onChange(policy));
const success = (policy: string): GraphQLResponse => ({
  data: {
    updatePostQuotePolicy: {
      post: { id: postId, quotePolicy: policy, viewerCanUpdateQuotePolicy: true },
    },
  },
});
const respond = (index: number, payload: GraphQLResponse) =>
  act(async () => {
    requests[index]!.sink.next(payload);
    requests[index]!.sink.complete();
  });

it('실제 Relay mutation은 pending을 표시하고 같은 Post의 정책을 정규화한 뒤 닫는다', async () => {
  await render();
  await choose('FOLLOWERS');
  assert.deepEqual(requests[0]!.variables, { input: { id: postId, quotePolicy: 'FOLLOWERS' } });
  assert.equal(radio().props.value, 'FOLLOWERS');
  assert.equal(radio().props.disabled, true);
  assert.equal(modal().props.dismissDisabled, true);
  await choose('AUTHOR');
  assert.equal(requests.length, 1);
  await respond(0, success('FOLLOWERS'));
  assert.equal(environments[0]!.getStore().getSource().get(postId)?.quotePolicy, 'FOLLOWERS');
  assert.equal(renderer!.root.findAllByType('ModalSheet' as never).length, 0);
});

for (const failure of ['network', 'graphql'] as const) {
  it(`${failure} 실패는 선택과 오류를 보존하고 같은 선택을 재시도할 수 있다`, async () => {
    await render();
    await choose('AUTHOR');
    if (failure === 'network') {
      await act(async () => requests[0]!.sink.error(new Error('offline')));
    } else {
      await respond(0, {
        data: null,
        errors: [{ message: 'rejected' }],
      } as unknown as GraphQLResponse);
    }
    assert.equal(radio().props.disabled, false);
    assert.equal(modal().props.dismissDisabled, false);
    assert.equal(radio().props.value, 'AUTHOR');
    assert.equal(alerts().length, 1);
    assert.equal(environments[0]!.getStore().getSource().get(postId)?.quotePolicy, 'EVERYONE');
    await choose('AUTHOR');
    assert.equal(requests.length, 2);
    assert.equal(alerts().length, 0);
    await respond(1, success('AUTHOR'));
    assert.equal(renderer!.root.findAllByType('ModalSheet' as never).length, 0);
  });
}

it('실패 뒤 원래 정책 선택은 추가 요청 없이 선택과 오류를 복구한다', async () => {
  await render();
  await choose('FOLLOWERS');
  await act(async () => requests[0]!.sink.error(new Error('offline')));
  await choose('EVERYONE');
  assert.equal(requests.length, 1);
  assert.equal(radio().props.value, 'EVERYONE');
  assert.equal(alerts().length, 0);
});

it('actor boundary remount 뒤 이전 응답은 새 actor의 Store와 열린 편집기에 영향을 주지 않는다', async () => {
  await render();
  await choose('AUTHOR');
  await act(async () => resetActor('profile:actor-b'));
  const actorB = environments.at(-1)!;
  assert.notEqual(actorB, environments[0]);
  assert.equal(radio().props.value, 'EVERYONE');
  assert.equal(radio().props.disabled, false);
  await respond(0, success('AUTHOR'));
  assert.equal(actorB.getStore().getSource().get(postId)?.quotePolicy, 'EVERYONE');
  assert.equal(radio().props.value, 'EVERYONE');
  assert.equal(alerts().length, 0);
});
