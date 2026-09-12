import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  commitMutation,
  ConnectionHandler,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import blockMutation from './__generated__/ProfileBlockControllerBlockMutation.graphql';
import unblockMutation from './__generated__/ProfileBlockControllerUnblockMutation.graphql';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { useProfileBlockMutations as UseProfileBlockMutations } from './ProfileBlockController';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ownerProfileId = 'owner-a';
const targetProfileId = 'target-a';
const targetHandle = '@target';
const connectionKey = 'SettingsBlockedProfiles_profileBlocks';
const connectionId = ConnectionHandler.getConnectionID(ownerProfileId, connectionKey);
const viewerStateId = 'client:target-a:viewerState';

type NetworkSink = {
  complete(): void;
  next(payload: GraphQLResponse): void;
};

let environment: Environment;
let sink: NetworkSink | undefined;
let generation = 1;
let selectedProfileId: string | null = ownerProfileId;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useMutation: (operation: string) => [
    (options: Record<string, unknown>) => {
      commitMutation(environment, {
        ...(options as unknown as Parameters<typeof commitMutation>[1]),
        mutation: operation.includes('UnblockMutation') ? unblockMutation : blockMutation,
      });
    },
    false,
  ],
  useRelayEnvironment: () => environment,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActor: () => ({
    resetActor: () => assert.fail('관계 mutation은 actor Store를 교체하지 않는다'),
  }),
});
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => ({ current: generation }),
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId }),
});

type Controller = ReturnType<typeof UseProfileBlockMutations>;

let useProfileBlockMutations: typeof UseProfileBlockMutations;
let renderer: ReactTestRenderer | null = null;
let controller: Controller | null = null;

const Harness: ComponentType<{ onReady: (value: Controller) => void }> = ({ onReady }) => {
  onReady(useProfileBlockMutations());
  return null;
};

before(async () => {
  ({ useProfileBlockMutations } = await import('./ProfileBlockController'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  environment = undefined as unknown as Environment;
  generation = 1;
  selectedProfileId = ownerProfileId;
  sink = undefined;
  controller = null;
});

describe('ProfileBlockController Relay cache boundary', () => {
  it('partial GraphQL errors reject feedback while preserving the server-confirmed normalized state', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({
      data: blockPayload('block-partial'),
      errors: [{ message: 'partial response' }],
    });

    await assert.rejects(request, /partial response/);
    assertGeneralProfileUnchanged();
    assert.deepEqual(connectionNodeIds(), ['block-partial']);
    assert.equal(viewerProfileBlockId(), 'block-partial');
  });

  it('기존 Profile global ID로 relation을 정규화하고 Profile cache를 보존한다', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({
      data: blockPayload('block-confirmed'),
    });

    await request;
    await flushTasks();

    assertGeneralProfileUnchanged();
    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('confirmed block updates the connection and target viewer state without replacing the actor Store', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({ data: blockPayload('block-confirmed') });
    await request;
    await flushTasks();

    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('해제 응답의 삭제된 관계 ID가 요청 ID와 같을 때 connection과 status를 갱신한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({
      data: {
        unblockProfile: {
          profileBlockId: 'block-confirmed',
          deletedProfileBlockId: 'block-confirmed',
          targetProfile: {
            __typename: 'Profile',
            id: targetProfileId,
            viewerState: { __typename: 'ProfileViewerState', profileBlock: null },
          },
        },
      },
    });
    await request;
    await flushTasks();

    assert.deepEqual(connectionNodeIds(), []);
    assert.equal(viewerProfileBlockId(), null);
  });

  it('해제 응답이 null이면 기존 connection과 status를 보존한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({
      data: {
        unblockProfile: { deletedProfileBlockId: null, profileBlockId: null, targetProfile: null },
      },
    });
    await assert.rejects(request, /did not confirm/);

    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });
});

async function renderController() {
  await act(async () => {
    renderer = create(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
  assert.ok(controller);
}

async function beginBlock() {
  await renderController();
  const request = controller?.changeBlocked({ ownerProfileId, targetProfileId }, true);
  assert.ok(request);
  assert.ok(sink);
  return { request };
}

async function beginUnblock(profileBlockId: string) {
  await renderController();
  const request = controller?.changeBlocked({ ownerProfileId, profileBlockId }, false);
  assert.ok(request);
  assert.ok(sink);
  return { request };
}

function respond(payload: GraphQLResponse) {
  assert.ok(sink);
  const activeSink = sink;
  sink = undefined;
  activeSink.next(payload);
  activeSink.complete();
}

function createEnvironment() {
  const source = new RecordSource();
  const nextEnvironment = new Environment({
    network: Network.create(() =>
      Observable.create<GraphQLResponse>((nextSink) => {
        sink = nextSink;
      }),
    ),
    store: new Store(source),
  });

  nextEnvironment.commitUpdate((store) => {
    const connection = store.create(connectionId, 'ProfileBlockConnection');
    connection.setLinkedRecords([], 'edges');
    const target = store.create(targetProfileId, 'Profile');
    target.setValue(targetProfileId, 'id');
    target.setValue('Original target', 'displayName');
    target.setValue(targetHandle, 'handle');
    target.setValue('example.com', 'domain');
    target.setValue('LOCAL', 'instanceKind');
    const viewerState = store.create(viewerStateId, 'ProfileViewerState');
    viewerState.setValue(null, 'profileBlock');
    target.setLinkedRecord(viewerState, 'viewerState');
  });
  return nextEnvironment;
}

function createRelation(relationId: string) {
  environment.commitUpdate((store) => {
    const relation = store.create(relationId, 'ProfileBlock');
    relation.setValue(relationId, 'id');
    const connection = store.get(connectionId);
    assert.ok(connection);
    const edge = ConnectionHandler.createEdge(
      store,
      connection,
      relation,
      'ProfileBlockConnectionEdge',
    );
    ConnectionHandler.insertEdgeBefore(connection, edge);
    store.get(viewerStateId)?.setLinkedRecord(relation, 'profileBlock');
  });
}

function blockPayload(relationId: string) {
  return {
    blockProfile: {
      profileBlock: {
        __typename: 'ProfileBlock',
        id: relationId,
        targetProfile: {
          __typename: 'Profile',
          id: targetProfileId,
          viewerState: {
            __typename: 'ProfileViewerState',
            profileBlock: { __typename: 'ProfileBlock', id: relationId },
          },
        },
      },
    },
  };
}

function assertGeneralProfileUnchanged() {
  const target = environment.getStore().getSource().get(targetProfileId);
  assert.ok(target);
  assert.deepEqual(
    {
      displayName: target.displayName,
      domain: target.domain,
      handle: target.handle,
      instanceKind: target.instanceKind,
    },
    {
      displayName: 'Original target',
      domain: 'example.com',
      handle: targetHandle,
      instanceKind: 'LOCAL',
    },
  );
}

function connectionNodeIds() {
  const connection = environment.getStore().getSource().get(connectionId);
  return (connection?.edges?.__refs ?? []).flatMap((edgeId: string) => {
    const edge = environment.getStore().getSource().get(edgeId);
    const nodeId = edge?.node?.__ref;
    return nodeId ? [nodeId] : [];
  });
}

function viewerProfileBlockId() {
  const viewerState = environment.getStore().getSource().get(viewerStateId);
  return viewerState?.profileBlock?.__ref ?? null;
}

async function flushTasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
