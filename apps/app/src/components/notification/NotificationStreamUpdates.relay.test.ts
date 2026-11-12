import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  createOperationDescriptor,
  createReaderSelector,
  Environment,
  getFragment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import BottomTabBarProfileFragment from '../shell/__generated__/BottomTabBar_profile.graphql';
import SidebarNavigationFragment from '../shell/__generated__/SidebarNavigation_query.graphql';
import UniversalShellQueryArtifact from '../shell/__generated__/UniversalShellQuery.graphql';
import NotificationListNextPageQueryArtifact from './__generated__/NotificationListNextPageQuery.graphql';
import type { ComponentType } from 'react';
import type { GraphQLResponse } from 'relay-runtime';
import type { NotificationListNextPageQuery } from './__generated__/NotificationListNextPageQuery.graphql';

type Subscription = {
  disposed: boolean;
  sink: { next(response: GraphQLResponse): void };
};

const subscriptionsA: Subscription[] = [];
const subscriptionsB: Subscription[] = [];
let renderer: ReturnType<typeof create> | null = null;
let NotificationStreamUpdates: ComponentType<{ profileId: string }>;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation|subscription) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});

before(async () => {
  ({ NotificationStreamUpdates } = await import('./NotificationStreamUpdates'));
});

function createNetwork(subscriptions: Subscription[]) {
  return Network.create(
    () => Promise.reject(new Error('Notification stream test does not load queries')),
    () =>
      Observable.create<GraphQLResponse>((sink) => {
        const subscription: Subscription = {
          disposed: false,
          sink,
        };
        subscriptions.push(subscription);
        return () => {
          subscription.disposed = true;
        };
      }),
  );
}

function createEnvironment(subscriptions: Subscription[]) {
  return new Environment({
    network: createNetwork(subscriptions),
    store: new Store(new RecordSource()),
  });
}

function seedProfile(environment: Environment, profileId: string) {
  const shellOperation = createOperationDescriptor(getRequest(UniversalShellQueryArtifact), {});
  environment.commitPayload(shellOperation, {
    currentSession: {
      id: `session-${profileId}`,
      selectedProfile: {
        id: profileId,
        unreadNotificationCount: 0,
        relativeHandle: profileId,
        displayName: profileId,
        avatar: null,
      },
    },
  } as unknown as GraphQLResponse);

  const notificationId = `notification-existing-${profileId}`;
  const listOperation = createOperationDescriptor(
    getRequest(NotificationListNextPageQueryArtifact),
    { id: profileId, count: 20, cursor: null } satisfies NotificationListNextPageQuery['variables'],
  );
  environment.commitPayload(listOperation, {
    node: {
      __typename: 'Profile',
      id: profileId,
      notifications: {
        edges: [
          {
            cursor: `cursor-${notificationId}`,
            node: followNotification(notificationId),
          },
        ],
        pageInfo: { endCursor: `cursor-${notificationId}`, hasNextPage: false },
      },
    },
  } as unknown as GraphQLResponse);

  return shellOperation;
}

function followNotification(id: string) {
  return {
    __typename: 'FollowNotification',
    id,
    createdAt: '2026-11-11T00:00:00Z',
    readAt: null,
    profile: {
      id: `actor-${id}`,
      displayName: 'Actor',
      relativeHandle: 'actor',
      avatar: null,
    },
  };
}

function emitAdded(
  subscription: Subscription,
  profileId: string,
  notification: ReturnType<typeof followNotification> | null,
  unreadNotificationCount: number,
) {
  subscription.sink.next({
    data: {
      notifications: {
        __typename: 'NotificationAdded',
        notification,
        profile: { id: profileId, unreadNotificationCount },
      },
    },
  });
}

function connectionNotificationIds(environment: Environment, profileId: string): string[] {
  const source = environment.getStore().getSource();
  const connection = source.get(
    ConnectionHandler.getConnectionID(profileId, 'NotificationList_notifications'),
  );
  assert.ok(connection);
  const edgeIds = (connection.edges as { __refs: string[] }).__refs;
  return edgeIds.map((edgeId) => {
    const edge = source.get(edgeId);
    assert.ok(edge);
    const node = edge.node as { __ref: string };
    return node.__ref;
  });
}

function unreadNotificationCount(
  environment: Environment,
  profileId: string,
  shellOperation: ReturnType<typeof createOperationDescriptor>,
): number | null | undefined {
  const selector = createReaderSelector(
    getFragment(BottomTabBarProfileFragment),
    profileId,
    {},
    shellOperation.request,
  );
  return (
    environment.lookup(selector).data as { unreadNotificationCount: number | null | undefined }
  ).unreadNotificationCount;
}

function selectedProfileBadgeCount(
  environment: Environment,
  shellOperation: ReturnType<typeof createOperationDescriptor>,
): number | null | undefined {
  const selector = createReaderSelector(
    getFragment(SidebarNavigationFragment),
    'client:root',
    {},
    shellOperation.request,
  );
  return (
    environment.lookup(selector).data as {
      currentSession?: { selectedProfile?: { unreadNotificationCount: number | null | undefined } };
    }
  ).currentSession?.selectedProfile?.unreadNotificationCount;
}

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  subscriptionsA.length = 0;
  subscriptionsB.length = 0;
});

describe('NotificationStreamUpdates with real Relay', () => {
  it('prepends each Notification once and normalizes the shell badge count', async () => {
    const profileId = 'profile-notifications';
    const environment = createEnvironment(subscriptionsA);
    const shellOperation = seedProfile(environment, profileId);

    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment,
          children: createElement(NotificationStreamUpdates, { profileId }),
        }),
      );
    });

    const subscription = subscriptionsA[0];
    assert.ok(subscription);
    const notification = followNotification('notification-incoming');
    await act(async () => emitAdded(subscription, profileId, notification, 1));
    await act(async () => emitAdded(subscription, profileId, notification, 1));
    assert.deepEqual(connectionNotificationIds(environment, profileId), [
      'notification-incoming',
      `notification-existing-${profileId}`,
    ]);
    assert.equal(unreadNotificationCount(environment, profileId, shellOperation), 1);
    assert.equal(selectedProfileBadgeCount(environment, shellOperation), 1);

    await act(async () => emitAdded(subscription, profileId, null, 2));
    await act(async () => subscription.sink.next({ data: { notifications: null } }));
    assert.deepEqual(connectionNotificationIds(environment, profileId), [
      'notification-incoming',
      `notification-existing-${profileId}`,
    ]);
    assert.equal(unreadNotificationCount(environment, profileId, shellOperation), 2);
    assert.equal(selectedProfileBadgeCount(environment, shellOperation), 2);
  });

  it('disposes the old stream when the selected Profile changes', async () => {
    const profileA = 'profile-a';
    const profileB = 'profile-b';
    const environmentA = createEnvironment(subscriptionsA);
    const environmentB = createEnvironment(subscriptionsB);
    seedProfile(environmentA, profileA);
    const shellOperationB = seedProfile(environmentB, profileB);

    await act(async () => {
      renderer = create(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment: environmentA,
          children: createElement(NotificationStreamUpdates, { profileId: profileA }),
        }),
      );
    });

    const subscriptionA = subscriptionsA[0];
    assert.ok(subscriptionA);

    await act(async () => {
      renderer?.update(
        createElement(ReactRelay.RelayEnvironmentProvider, {
          environment: environmentB,
          children: createElement(NotificationStreamUpdates, { profileId: profileB }),
        }),
      );
    });

    const subscriptionB = subscriptionsB[0];
    assert.ok(subscriptionB);
    assert.equal(subscriptionA.disposed, true);

    await act(async () =>
      emitAdded(subscriptionA, profileA, followNotification('notification-a'), 99),
    );
    assert.deepEqual(connectionNotificationIds(environmentB, profileB), [
      `notification-existing-${profileB}`,
    ]);
    assert.equal(unreadNotificationCount(environmentB, profileB, shellOperationB), 0);
    assert.equal(environmentB.getStore().getSource().get('notification-a'), undefined);

    await act(async () =>
      emitAdded(subscriptionB, profileB, followNotification('notification-b'), 1),
    );
    assert.deepEqual(connectionNotificationIds(environmentB, profileB), [
      'notification-b',
      `notification-existing-${profileB}`,
    ]);
    assert.equal(unreadNotificationCount(environmentB, profileB, shellOperationB), 1);
  });
});
