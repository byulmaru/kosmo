import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitMutation } from 'react-relay';
import {
  ConnectionHandler,
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import cancelMutation from './__generated__/ProfileFollowRequestStoreCancelMutation.graphql';
import rejectMutation from './__generated__/ProfileFollowRequestStoreRejectMutation.graphql';
import type { ConcreteRequest, GraphQLResponse } from 'relay-runtime';

type RequestConnectionCase = {
  actorField: 'followeeProfile' | 'followerProfile';
  connectionKey: 'Profile_incomingProfileFollowRequests' | 'Profile_outgoingProfileFollowRequests';
  mutation: ConcreteRequest;
};

for (const { actorField, connectionKey, mutation } of [
  {
    actorField: 'followeeProfile',
    connectionKey: 'Profile_incomingProfileFollowRequests',
    mutation: rejectMutation,
  },
  {
    actorField: 'followerProfile',
    connectionKey: 'Profile_outgoingProfileFollowRequests',
    mutation: cancelMutation,
  },
] satisfies RequestConnectionCase[]) {
  test(`${mutation.params.name} removes the deleted request edge from the actor connection`, async () => {
    const actorProfileId = `actor-${actorField}`;
    const deletedRequestId = `deleted-${actorField}`;
    const preservedRequestId = `preserved-${actorField}`;
    const connectionId = ConnectionHandler.getConnectionID(actorProfileId, connectionKey);
    const environment = new Environment({
      network: Network.create(() =>
        Observable.from({
          data: {
            [mutation.params.name.startsWith('ProfileFollowRequestStoreReject')
              ? 'rejectProfileFollowRequest'
              : 'cancelProfileFollowRequest']: {
              [actorField]: { __typename: 'Profile', id: actorProfileId },
              profileFollowRequestId: deletedRequestId,
            },
          },
        } satisfies GraphQLResponse),
      ),
      store: new Store(new RecordSource()),
    });

    environment.commitUpdate((store) => {
      const actor = store.create(actorProfileId, 'Profile');
      const connection = store.create(connectionId, 'ProfileFollowRequestConnection');
      actor.setLinkedRecord(connection, connectionKey);

      for (const requestId of [deletedRequestId, preservedRequestId]) {
        const request = store.create(requestId, 'ProfileFollowRequest');
        const edge = ConnectionHandler.createEdge(
          store,
          connection,
          request,
          'ProfileFollowRequestEdge',
        );
        ConnectionHandler.insertEdgeAfter(connection, edge);
      }
    });

    await new Promise<void>((resolve, reject) => {
      commitMutation(environment, {
        mutation,
        onCompleted: () => resolve(),
        onError: reject,
        variables: { connections: [connectionId], id: deletedRequestId },
      });
    });

    environment.commitUpdate((store) => {
      const connection = store.get(connectionId);
      assert.ok(connection);
      assert.deepEqual(
        connection
          .getLinkedRecords('edges')
          ?.map((edge) => edge.getLinkedRecord('node')?.getDataID()),
        [preservedRequestId],
      );
    });
  });
}
