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
const statusId = 'client:profileBlockStatus:target';

type NetworkSink = {
  complete(): void;
  next(payload: GraphQLResponse): void;
};

let environment: Environment;
let sink: NetworkSink | undefined;
let generation = 1;
let selectedProfileId: string | null = ownerProfileId;
const resetCalls: string[] = [];

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
  useRelayActor: () => ({ resetActor: (profileId: string) => resetCalls.push(profileId) }),
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
  resetCalls.length = 0;
  controller = null;
});

describe('ProfileBlockController Relay cache boundary', () => {
  it('partial GraphQL errors preserve Profile fields and remove the normalized failed relation', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({
      data: blockPayload('block-partial'),
      errors: [{ message: 'partial response' }],
    });

    await assert.rejects(request, /partial response/);
    assertUnchangedAfterFailedBlock('block-partial');
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
    assert.deepEqual(statusValues(), { blocking: true, profileBlockId: 'block-confirmed' });
    assert.deepEqual(resetCalls, [ownerProfileId]);
  });

  it('confirmed block updates the connection and status, then refreshes the actor', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({ data: blockPayload('block-confirmed') });
    await request;
    await flushTasks();

    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.deepEqual(statusValues(), { blocking: true, profileBlockId: 'block-confirmed' });
    assert.equal(resetCalls.length, 1);
    assert.equal(resetCalls[0], ownerProfileId);
  });

  it('해제 응답의 삭제된 관계 ID가 요청 ID와 같을 때 connection과 status를 갱신한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({ data: { unblockProfile: { profileBlockId: 'block-confirmed' } } });
    await request;
    await flushTasks();

    assert.deepEqual(connectionNodeIds(), []);
    assert.deepEqual(statusValues(), { blocking: false, profileBlockId: null });
    assert.deepEqual(resetCalls, [ownerProfileId]);
  });

  it('해제 응답이 null이면 기존 connection과 status를 보존한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({ data: { unblockProfile: { profileBlockId: null } } });
    await assert.rejects(request, /did not confirm/);

    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.deepEqual(statusValues(), { blocking: true, profileBlockId: 'block-confirmed' });
    assert.deepEqual(resetCalls, []);
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
  const request = controller?.changeBlocked(
    { handle: targetHandle, ownerProfileId, targetProfileId },
    true,
  );
  assert.ok(request);
  assert.ok(sink);
  return { request };
}

async function beginUnblock(profileBlockId: string) {
  await renderController();
  const request = controller?.changeBlocked(
    { handle: targetHandle, ownerProfileId, profileBlockId },
    false,
  );
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
    const status = store.create(statusId, 'ProfileBlockStatus');
    status.setValue(false, 'blocking');
    status.setValue(null, 'profileBlockId');
    store.getRoot().setLinkedRecord(status, 'profileBlockStatus', { handle: targetHandle });
    const target = store.create(targetProfileId, 'Profile');
    target.setValue(targetProfileId, 'id');
    target.setValue('Original target', 'displayName');
    target.setValue(targetHandle, 'handle');
    target.setValue('example.com', 'domain');
    target.setValue('LOCAL', 'instanceKind');
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
    const status = store.get(statusId);
    status?.setValue(true, 'blocking');
    status?.setValue(relationId, 'profileBlockId');
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
        },
      },
    },
  };
}

function assertUnchangedAfterFailedBlock(relationId: string) {
  const source = environment.getStore().getSource();
  assertGeneralProfileUnchanged();
  assert.equal(source.get(relationId), null);
  assert.deepEqual(connectionNodeIds(), []);
  assert.deepEqual(statusValues(), { blocking: false, profileBlockId: null });
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

function statusValues() {
  const status = environment.getStore().getSource().get(statusId);
  return { blocking: status?.blocking, profileBlockId: status?.profileBlockId };
}

async function flushTasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
