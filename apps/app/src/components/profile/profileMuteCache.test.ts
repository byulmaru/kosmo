import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import {
  addProfileMuteToStore,
  getProfileMuteConnectionId,
  removeProfileMuteFromStore,
} from './profileMuteCache';

function createEnvironment() {
  const ownerA = 'profile:owner-a';
  const ownerB = 'profile:owner-b';
  const targetA = 'profile:target-a';
  const targetB = 'profile:target-b';
  const relationA = 'profile-mute:target-a';
  const relationB = 'profile-mute:target-b';
  const viewerStateA = 'viewer-state:owner-a';
  const viewerStateB = 'viewer-state:owner-b';
  const connectionA = getProfileMuteConnectionId(ownerA);
  const connectionB = getProfileMuteConnectionId(ownerB);
  const edgeA = 'edge:owner-a:existing';
  const edgeB = 'edge:owner-b:existing';

  const environment = new Environment({
    network: Network.create(() => {
      throw new Error('network is not expected in a cache test');
    }),
    store: new Store(
      new RecordSource({
        [ownerA]: { __id: ownerA, __typename: 'Profile', id: ownerA },
        [ownerB]: { __id: ownerB, __typename: 'Profile', id: ownerB },
        [targetA]: {
          __id: targetA,
          __typename: 'Profile',
          id: targetA,
          viewerState: { __ref: viewerStateA },
        },
        [targetB]: {
          __id: targetB,
          __typename: 'Profile',
          id: targetB,
          viewerState: { __ref: viewerStateB },
        },
        [viewerStateA]: { __id: viewerStateA, __typename: 'ProfileViewerState' },
        [viewerStateB]: { __id: viewerStateB, __typename: 'ProfileViewerState' },
        [relationA]: { __id: relationA, __typename: 'ProfileMute', id: relationA },
        [relationB]: { __id: relationB, __typename: 'ProfileMute', id: relationB },
        [connectionA]: {
          __id: connectionA,
          __typename: '__Connection',
          edges: { __refs: [edgeA] },
        },
        [connectionB]: {
          __id: connectionB,
          __typename: '__Connection',
          edges: { __refs: [edgeB] },
        },
        [edgeA]: {
          __id: edgeA,
          __typename: 'ProfileMuteConnectionEdge',
          cursor: 'existing-a',
          node: { __ref: 'profile-mute:existing-a' },
        },
        [edgeB]: {
          __id: edgeB,
          __typename: 'ProfileMuteConnectionEdge',
          cursor: 'existing-b',
          node: { __ref: 'profile-mute:existing-b' },
        },
        'profile-mute:existing-a': {
          __id: 'profile-mute:existing-a',
          __typename: 'ProfileMute',
          id: 'profile-mute:existing-a',
        },
        'profile-mute:existing-b': {
          __id: 'profile-mute:existing-b',
          __typename: 'ProfileMute',
          id: 'profile-mute:existing-b',
        },
      }),
    ),
  });

  return {
    connectionA,
    connectionB,
    environment,
    ownerA,
    ownerB,
    relationA,
    relationB,
    targetA,
    targetB,
    viewerStateA,
  };
}

function connectionNodeIds(environment: Environment, connectionId: string) {
  const edges = environment.getStore().getSource().get(connectionId)?.edges?.__refs ?? [];
  return edges.map((edgeId: string) => environment.getStore().getSource().get(edgeId)?.node?.__ref);
}

describe('profile mute Relay cache', () => {
  it('adds the relation once to the selected owner connection and viewer state', () => {
    const { connectionA, environment, ownerA, relationA, targetA, viewerStateA } =
      createEnvironment();

    environment.commitUpdate((store) => {
      addProfileMuteToStore(store, ownerA, relationA, targetA);
      addProfileMuteToStore(store, ownerA, relationA, targetA);
    });

    assert.deepEqual(connectionNodeIds(environment, connectionA), [
      relationA,
      'profile-mute:existing-a',
    ]);
    assert.equal(
      environment.getStore().getSource().get(viewerStateA)?.profileMute?.__ref,
      relationA,
    );
  });

  it('removes only the requested owner relation and leaves another owner untouched', () => {
    const {
      connectionA,
      connectionB,
      environment,
      ownerA,
      ownerB,
      relationA,
      relationB,
      targetA,
      targetB,
      viewerStateA,
    } = createEnvironment();

    environment.commitUpdate((store) => {
      addProfileMuteToStore(store, ownerA, relationA, targetA);
      addProfileMuteToStore(store, ownerB, relationB, targetB);
    });
    environment.commitUpdate((store) => {
      removeProfileMuteFromStore(store, ownerA, relationA, targetA);
    });

    assert.deepEqual(connectionNodeIds(environment, connectionA), ['profile-mute:existing-a']);
    assert.deepEqual(connectionNodeIds(environment, connectionB), [
      relationB,
      'profile-mute:existing-b',
    ]);
    assert.equal(environment.getStore().getSource().get(viewerStateA)?.profileMute, null);
    assert.equal(environment.getStore().getSource().get(relationA), null);
    assert.ok(environment.getStore().getSource().get(relationB));
  });
});
