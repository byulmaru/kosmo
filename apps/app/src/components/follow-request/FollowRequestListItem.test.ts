import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import approveMutation from './__generated__/FollowRequestListItemApproveMutation.graphql';
import rejectMutation from './__generated__/FollowRequestListItemRejectMutation.graphql';

const profileId = 'profile-follow-request-owner';
const requestId = 'follow-request-active';
const edgeId = 'follow-request-edge-active';
const connectionId = ConnectionHandler.getConnectionID(
  profileId,
  'FollowRequestList_incomingProfileFollowRequests',
);

function createEnvironment() {
  const source = new RecordSource();
  source.set(connectionId, {
    __id: connectionId,
    __typename: 'ProfileIncomingProfileFollowRequestsConnection',
    edges: { __refs: [edgeId] },
  });
  source.set(edgeId, {
    __id: edgeId,
    __typename: 'ProfileIncomingProfileFollowRequestsConnectionEdge',
    cursor: 'follow-request-cursor-active',
    node: { __ref: requestId },
  });
  source.set(requestId, {
    __id: requestId,
    __typename: 'ProfileFollowRequest',
    id: requestId,
  });

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function variables() {
  return { connections: [connectionId], id: requestId };
}

function assertRequestRemoved(environment: Environment) {
  assert.equal(environment.getStore().getSource().get(requestId), null);
  assert.deepEqual(environment.getStore().getSource().get(connectionId)?.edges, {
    __refs: [],
  });
}

describe('follow request mutation connection contract', () => {
  it('removes an approved request edge and record after successful normalization', () => {
    const environment = createEnvironment();
    const operation = createOperationDescriptor(getRequest(approveMutation), variables());
    environment.commitPayload(operation, {
      approveProfileFollowRequest: {
        profileFollowRequestId: requestId,
        followerProfile: {
          __typename: 'Profile',
          followingCount: 2,
          id: 'profile-requester',
        },
        followeeProfile: {
          __typename: 'Profile',
          followersCount: 3,
          id: profileId,
        },
        profileFollow: {
          __typename: 'ProfileFollow',
          follower: { __typename: 'Profile', id: 'profile-requester' },
          followee: { __typename: 'Profile', id: profileId },
          id: 'profile-follow-active',
        },
      },
    });

    assertRequestRemoved(environment);
  });

  it('removes a rejected request edge and record after successful normalization', () => {
    const environment = createEnvironment();
    const operation = createOperationDescriptor(getRequest(rejectMutation), variables());
    environment.commitPayload(operation, {
      rejectProfileFollowRequest: {
        profileFollowRequestId: requestId,
        followeeProfile: { __typename: 'Profile', id: profileId },
      },
    });

    assertRequestRemoved(environment);
  });
});
