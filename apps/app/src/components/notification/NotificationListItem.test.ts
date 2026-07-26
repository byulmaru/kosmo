import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitMutation } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import MarkReadMutation from './__generated__/NotificationListItemMarkReadMutation.graphql';
import type { NotificationListItemMarkReadMutation } from './__generated__/NotificationListItemMarkReadMutation.graphql';

const notificationId = 'notification-unread';
const recipientId = 'notification-profile-content';
const otherRecipientId = 'notification-profile-other';
const readAt = '2026-07-21T12:00:00Z';
type NotificationTypename = 'FollowNotification' | 'RepostNotification';

function createEnvironment(typename: NotificationTypename = 'FollowNotification') {
  const source = new RecordSource();
  source.set(notificationId, {
    __id: notificationId,
    __typename: typename,
    id: notificationId,
    readAt: null,
  });
  source.set(recipientId, {
    __id: recipientId,
    __typename: 'Profile',
    id: recipientId,
    unreadNotificationCount: 2,
  });
  source.set(otherRecipientId, {
    __id: otherRecipientId,
    __typename: 'Profile',
    id: otherRecipientId,
    unreadNotificationCount: 7,
  });

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function commitReadPayload(
  environment: Environment,
  typename: NotificationTypename = 'FollowNotification',
) {
  const operation = createOperationDescriptor(getRequest(MarkReadMutation), {
    id: notificationId,
  });
  environment.commitPayload(operation, {
    markNotificationRead: {
      notification: { __typename: typename, id: notificationId, readAt },
      recipientProfile: {
        __typename: 'Profile',
        id: recipientId,
        unreadNotificationCount: 1,
      },
    },
  });
}

function requireRecord(environment: Environment, id: string) {
  const record = environment.getStore().getSource().get(id);
  assert.ok(record);
  return record;
}

describe('NotificationListItem Read cache', () => {
  it('normalizes the exact Notification and Recipient Profile', () => {
    const environment = createEnvironment();

    commitReadPayload(environment);

    assert.equal(requireRecord(environment, notificationId).readAt, readAt);
    assert.equal(requireRecord(environment, recipientId).unreadNotificationCount, 1);
    assert.equal(requireRecord(environment, otherRecipientId).unreadNotificationCount, 7);
  });

  it('normalizes a Repost Notification and Recipient Profile in the same actor Store', () => {
    const environment = createEnvironment('RepostNotification');

    commitReadPayload(environment, 'RepostNotification');

    assert.equal(requireRecord(environment, notificationId).__typename, 'RepostNotification');
    assert.equal(requireRecord(environment, notificationId).readAt, readAt);
    assert.equal(requireRecord(environment, recipientId).unreadNotificationCount, 1);
    assert.equal(requireRecord(environment, otherRecipientId).unreadNotificationCount, 7);
  });

  it('keeps repeated final payloads and another actor Store isolated', () => {
    const actorA = createEnvironment('RepostNotification');
    const actorB = createEnvironment('RepostNotification');

    commitReadPayload(actorA, 'RepostNotification');
    commitReadPayload(actorA, 'RepostNotification');

    assert.equal(requireRecord(actorA, notificationId).__typename, 'RepostNotification');
    assert.equal(requireRecord(actorA, notificationId).readAt, readAt);
    assert.equal(requireRecord(actorA, recipientId).unreadNotificationCount, 1);
    assert.equal(requireRecord(actorB, notificationId).readAt, null);
    assert.equal(requireRecord(actorB, recipientId).unreadNotificationCount, 2);
  });

  it('leaves records unchanged after a network failure', async () => {
    const environment = createEnvironment();

    await new Promise<void>((resolve, reject) => {
      commitMutation<NotificationListItemMarkReadMutation>(environment, {
        mutation: MarkReadMutation,
        variables: { id: notificationId },
        onCompleted: () => reject(new Error('network failure must not complete')),
        onError: () => resolve(),
      });
    });

    assert.equal(requireRecord(environment, notificationId).readAt, null);
    assert.equal(requireRecord(environment, recipientId).unreadNotificationCount, 2);
  });
});
