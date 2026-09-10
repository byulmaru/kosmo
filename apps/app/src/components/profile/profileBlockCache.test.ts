import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { ConnectionHandler, Environment, Network, RecordSource, Store } from 'relay-runtime';
import type * as ProfileBlockCache from './profileBlockCache';

const connectionKey = 'SettingsBlockedProfiles_profileBlocks';
const handle = '@blocked';

let cache: typeof ProfileBlockCache | undefined;

before(async () => {
  cache = await import('./profileBlockCache');
});

function createEnvironment(ownerProfileId: string) {
  const environment = new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(new RecordSource()),
  });

  environment.commitUpdate((store) => {
    const connection = store.create(
      ConnectionHandler.getConnectionID(ownerProfileId, connectionKey),
      'ProfileBlockConnection',
    );
    connection.setLinkedRecords([], 'edges');
    const status = store.create(`client:profileBlockStatus:${handle}`, 'ProfileBlockStatus');
    status.setValue(false, 'blocking');
    status.setValue(null, 'profileBlockId');
    store.getRoot().setLinkedRecord(status, 'profileBlockStatus', { handle });
  });

  return environment;
}

function createRelation(environment: Environment, relationId: string) {
  environment.commitUpdate((store) => {
    const relation = store.create(relationId, 'ProfileBlock');
    relation.setValue(relationId, 'id');
  });
}

function connectionNodeIds(environment: Environment, ownerProfileId: string) {
  const ids: string[] = [];
  environment.commitUpdate((store) => {
    const connection = store.get(ConnectionHandler.getConnectionID(ownerProfileId, connectionKey));
    for (const edge of connection?.getLinkedRecords('edges') ?? []) {
      const node = edge.getLinkedRecord('node');
      if (node) {
        ids.push(node.getDataID());
      }
    }
  });
  return ids;
}

function statusValues(environment: Environment) {
  let values: { blocking: unknown; profileBlockId: unknown } | undefined;
  environment.commitUpdate((store) => {
    const status = store.getRoot().getLinkedRecord('profileBlockStatus', { handle });
    values = {
      blocking: status?.getValue('blocking'),
      profileBlockId: status?.getValue('profileBlockId'),
    };
  });
  return values;
}

describe('profile block cache', () => {
  it('현재 actor의 connection과 status만 갱신한다', () => {
    assert.ok(cache);
    const actorA = createEnvironment('owner-a');
    const actorB = createEnvironment('owner-b');
    createRelation(actorA, 'block-a');
    createRelation(actorB, 'block-b');

    actorA.commitUpdate((store) => {
      cache?.addProfileBlockToStore(store, 'owner-a', 'block-a');
      cache?.updateProfileBlockStatus(store, handle, {
        blocking: true,
        profileBlockId: 'block-a',
      });
    });

    assert.deepEqual(connectionNodeIds(actorA, 'owner-a'), ['block-a']);
    assert.deepEqual(connectionNodeIds(actorB, 'owner-b'), []);
    assert.deepEqual(statusValues(actorA), { blocking: true, profileBlockId: 'block-a' });

    actorA.commitUpdate((store) => {
      cache?.removeProfileBlockFromStore(store, 'owner-a', 'block-a');
      cache?.updateProfileBlockStatus(store, handle, {
        blocking: false,
        profileBlockId: null,
      });
    });

    assert.deepEqual(connectionNodeIds(actorA, 'owner-a'), []);
    assert.deepEqual(statusValues(actorA), { blocking: false, profileBlockId: null });
    assert.equal(actorA.getStore().getSource().get('block-a'), null);
    assert.ok(actorB.getStore().getSource().get('block-b'));
  });

  it('없는 relation을 지워도 다른 목록 항목을 건드리지 않는다', () => {
    assert.ok(cache);
    const environment = createEnvironment('owner-a');
    createRelation(environment, 'block-a');
    environment.commitUpdate((store) => {
      cache?.addProfileBlockToStore(store, 'owner-a', 'block-a');
      cache?.removeProfileBlockFromStore(store, 'owner-a', 'block-missing');
    });

    assert.deepEqual(connectionNodeIds(environment, 'owner-a'), ['block-a']);
    assert.ok(environment.getStore().getSource().get('block-a'));
  });
});
