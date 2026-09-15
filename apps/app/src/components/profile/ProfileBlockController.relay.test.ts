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
import { StaleProfileBlockRequestError } from './profileBlockErrors';
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
let selectedProfileId: string | null = ownerProfileId;
const environmentGenerationRef = { current: 0 };

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
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId }),
});
mockModule(new URL('../../relay/RelayEnvironmentBoundary.tsx', import.meta.url), {
  useRelayEnvironmentGeneration: () => environmentGenerationRef,
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
  selectedProfileId = ownerProfileId;
  environmentGenerationRef.current = 0;
  sink = undefined;
  controller = null;
});

describe('ProfileBlockController Relay cache boundary', () => {
  it('기존 Profile global ID로 relation을 정규화하고 Profile cache를 보존한다', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    respond({
      data: blockPayload('block-confirmed'),
    });

    await request;
    assertGeneralProfileUnchanged();
    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('해제 응답이 null이면 기존 connection과 status를 보존한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({
      data: {
        unblockProfile: {
          success: false,
          profileBlockId: null,
        },
      },
    });
    await assert.rejects(request, /did not confirm/);

    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('unblock payload가 없으면 기존 connection과 status를 보존한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({ data: { unblockProfile: null } });

    await assert.rejects(request, /did not confirm/);
    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('unblock 성공은 기존 relation의 Target identity를 재사용한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({
      data: {
        unblockProfile: {
          success: true,
          profileBlockId: 'block-confirmed',
        },
      },
    });

    await request;
    assert.deepEqual(connectionNodeIds(), []);
    assert.equal(viewerProfileBlockId(), null);
  });

  it('unblock relation ID가 요청과 다르면 기존 relation을 보존한다', async () => {
    environment = createEnvironment();
    createRelation('block-confirmed');
    const { request } = await beginUnblock('block-confirmed');

    respond({
      data: {
        unblockProfile: {
          success: true,
          profileBlockId: 'block-other',
        },
      },
    });

    await assert.rejects(request, /did not confirm/);
    assert.deepEqual(connectionNodeIds(), ['block-confirmed']);
    assert.equal(viewerProfileBlockId(), 'block-confirmed');
  });

  it('느린 unblock 응답이 더 새로운 Block relation을 지우지 않는다', async () => {
    environment = createEnvironment();
    createRelation('block-old');
    const { request } = await beginUnblock('block-old');
    createRelation('block-new');

    respond({
      data: {
        unblockProfile: {
          success: true,
          profileBlockId: 'block-old',
        },
      },
    });

    await request;
    assert.deepEqual(connectionNodeIds(), ['block-new']);
    assert.equal(viewerProfileBlockId(), 'block-new');
  });

  it('actor A 응답이 A→B→A 전환 뒤의 새 A Store를 변경하지 않는다', async () => {
    environment = createEnvironment();
    const { request } = await beginBlock();

    selectedProfileId = 'owner-b';
    environmentGenerationRef.current += 1;
    environment = createEnvironment();
    await rerenderController();
    selectedProfileId = ownerProfileId;
    environmentGenerationRef.current += 1;
    environment = createEnvironment();
    const currentEnvironment = environment;
    await rerenderController();

    respond({ data: blockPayload('block-stale') });

    await assert.rejects(request, StaleProfileBlockRequestError);
    environment = currentEnvironment;
    assert.deepEqual(connectionNodeIds(), []);
    assert.equal(viewerProfileBlockId(), null);
  });

  it('actor A unblock 응답이 actor B Store를 변경하지 않는다', async () => {
    environment = createEnvironment();
    createRelation('block-stale');
    const { request } = await beginUnblock('block-stale');

    selectedProfileId = 'owner-b';
    environmentGenerationRef.current += 1;
    environment = createEnvironment();
    const currentEnvironment = environment;
    await rerenderController();

    respond({
      data: {
        unblockProfile: {
          success: true,
          profileBlockId: 'block-stale',
        },
      },
    });

    await assert.rejects(request, StaleProfileBlockRequestError);
    environment = currentEnvironment;
    assert.deepEqual(connectionNodeIds(), []);
    assert.equal(viewerProfileBlockId(), null);
  });
});

async function renderController() {
  await act(async () => {
    renderer = create(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
  assert.ok(controller);
}

async function rerenderController() {
  await act(async () => {
    renderer?.update(createElement(Harness, { onReady: (value) => (controller = value) }));
  });
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
  const request = controller?.changeBlocked(
    { ownerProfileId, profileBlockId, targetProfileId },
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
      success: true,
      profileBlock: {
        __typename: 'ProfileBlock',
        id: relationId,
        targetProfile: {
          __typename: 'Profile',
          displayName: 'Original target',
          id: targetProfileId,
          relativeHandle: targetHandle,
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
