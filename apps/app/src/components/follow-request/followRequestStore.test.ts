import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { ConnectionHandler, Environment, Network, RecordSource, Store } from 'relay-runtime';
import type { RecordSourceProxy } from 'relay-runtime';

const connectionKey = 'FollowRequestList_incomingProfileFollowRequests';
const profileId = 'profile-selected';
const connectionId = ConnectionHandler.getConnectionID(profileId, connectionKey);

type RemoveFollowRequestFromConnection = (
  store: RecordSourceProxy,
  targetConnectionId: string,
  requestId: string,
) => void;

let removeFollowRequestFromConnection: RemoveFollowRequestFromConnection | null = null;

before(async () => {
  const module = await import('./followRequestStore').catch(() => null);
  removeFollowRequestFromConnection = module?.removeFollowRequestFromConnection ?? null;
});

function createEnvironment() {
  const environment = new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(new RecordSource()),
  });

  environment.commitUpdate((store) => {
    const profile = store.create(profileId, 'Profile');
    profile.setValue(profileId, 'id');
    const connection = store.create(connectionId, 'ProfileIncomingProfileFollowRequestsConnection');
    connection.setLinkedRecords([], 'edges');

    for (const requestId of ['request-a', 'request-b']) {
      const request = store.create(requestId, 'ProfileFollowRequest');
      request.setValue(requestId, 'id');
      const edge = ConnectionHandler.createEdge(
        store,
        connection,
        request,
        'ProfileIncomingProfileFollowRequestsConnectionEdge',
      );
      ConnectionHandler.insertEdgeAfter(connection, edge);
    }
  });

  return environment;
}

function connectionNodeIds(environment: Environment) {
  const ids: string[] = [];
  environment.commitUpdate((store) => {
    const connection = store.get(connectionId);
    for (const edge of connection?.getLinkedRecords('edges') ?? []) {
      const node = edge.getLinkedRecord('node');
      if (node) {
        ids.push(node.getDataID());
      }
    }
  });
  return ids;
}

describe('follow request connection removal', () => {
  it('현재 actor connection의 payload ID edge와 request record만 제거한다', () => {
    assert.ok(removeFollowRequestFromConnection, 'removeFollowRequestFromConnection must exist');
    const actorA = createEnvironment();
    const actorB = createEnvironment();

    actorA.commitUpdate((store) => {
      removeFollowRequestFromConnection?.(store, connectionId, 'request-a');
    });

    assert.deepEqual(connectionNodeIds(actorA), ['request-b']);
    assert.equal(actorA.getStore().getSource().get('request-a'), null);
    assert.deepEqual(connectionNodeIds(actorB), ['request-a', 'request-b']);
    assert.ok(actorB.getStore().getSource().get('request-a'));
  });

  it('payload ID와 다른 request edge를 제거하지 않는다', () => {
    assert.ok(removeFollowRequestFromConnection, 'removeFollowRequestFromConnection must exist');
    const environment = createEnvironment();

    environment.commitUpdate((store) => {
      removeFollowRequestFromConnection?.(store, connectionId, 'request-missing');
    });

    assert.deepEqual(connectionNodeIds(environment), ['request-a', 'request-b']);
    assert.ok(environment.getStore().getSource().get('request-a'));
    assert.ok(environment.getStore().getSource().get('request-b'));
  });
});
