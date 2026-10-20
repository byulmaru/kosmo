import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { NotificationListItem as NotificationListItemComponent } from './NotificationListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationResponse = {
  markNotificationRead: {
    notifications?: ReadonlyArray<{ id: string; readAt: string | null }>;
  } | null;
} | null;

type MutationConfig = {
  onCompleted: (response: MutationResponse, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: { ids: ReadonlyArray<string> };
};

const generationRef = { current: 1 };
const mutationConfigs: MutationConfig[] = [];
const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
const notificationId = 'notification-1';
let NotificationListItem: typeof NotificationListItemComponent;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
  useMutation: () => [
    (config: MutationConfig) => {
      mutationConfigs.push(config);
    },
  ],
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금 전' });
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule('./MentionNotificationPost', {
  MentionNotificationPost: (props: Record<string, unknown>) =>
    createElement('MentionNotificationPost', props),
});
mockModule('./NotificationListItemView', {
  NotificationListItemView: (props: Record<string, unknown>) =>
    createElement('NotificationListItemView', props),
});
mockModule('./QuoteNotificationPost', {
  QuoteNotificationPost: (props: Record<string, unknown>) =>
    createElement('QuoteNotificationPost', props),
});
mockModule('./ReplyNotificationPost', {
  ReplyNotificationPost: (props: Record<string, unknown>) =>
    createElement('ReplyNotificationPost', props),
});
mockModule('./notificationHref', {
  parseNotificationHref: (href: string) => ({ href, kind: 'internal' }),
});

before(async () => {
  ({ NotificationListItem } = await import('./NotificationListItem'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mutationConfigs.length = 0;
  analyticsCalls.length = 0;
  generationRef.current = 1;
});

function notification(readAt: string | null) {
  return {
    avatar: null,
    createdAt: '2026-10-21T00:00:00.000Z',
    displayName: '팔로워',
    handle: 'follower',
    id: notificationId,
    profile: {
      avatar: null,
      displayName: '팔로워',
      handle: 'follower',
      id: 'profile-follower',
      relativeHandle: '@follower',
    },
    readAt,
  };
}

async function openNotification(readAt: string | null) {
  await act(async () => {
    renderer = create(
      createElement(NotificationListItem, { notification: notification(readAt) as never }),
    );
  });
  const view = renderer?.root.findByType('NotificationListItemView' as ElementType);
  assert.ok(view);
  await act(async () => view.props.onNavigate());
}

describe('Notification analytics', () => {
  it('records a valid notification target and confirmed unread single read', async () => {
    await openNotification(null);

    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);
    assert.deepEqual(mutationConfigs[0]?.variables, { ids: [notificationId] });

    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [{ id: notificationId, readAt: '2026-10-21T00:01:00.000Z' }],
        },
      }),
    );

    assert.deepEqual(analyticsCalls, [
      ['notification_opened', { kind: 'follow' }],
      ['notifications_read', { scope: 'single' }],
    ]);
  });

  it('does not record a single read for an already-read notification', async () => {
    await openNotification('2026-10-20T00:00:00.000Z');

    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [{ id: notificationId, readAt: '2026-10-20T00:00:00.000Z' }],
        },
      }),
    );

    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);
  });

  it('suppresses a single read when the response is missing or has errors', async () => {
    await openNotification(null);
    await act(async () => mutationConfigs[0]?.onCompleted({ markNotificationRead: null }));
    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);

    await act(async () => renderer?.unmount());
    renderer = null;
    mutationConfigs.length = 0;
    analyticsCalls.length = 0;

    await openNotification(null);
    await act(async () =>
      mutationConfigs[0]?.onCompleted(
        {
          markNotificationRead: {
            notifications: [{ id: notificationId, readAt: '2026-10-21T00:01:00.000Z' }],
          },
        },
        [{ message: 'field error' }],
      ),
    );

    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);

    await act(async () => renderer?.unmount());
    renderer = null;
    mutationConfigs.length = 0;
    analyticsCalls.length = 0;

    await openNotification(null);
    await act(async () => mutationConfigs[0]?.onCompleted({ markNotificationRead: {} }));
    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);

    await act(async () => renderer?.unmount());
    renderer = null;
    mutationConfigs.length = 0;
    analyticsCalls.length = 0;

    await openNotification(null);
    await act(async () => mutationConfigs[0]?.onError(new Error('network failure')));

    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);
  });

  it('suppresses a stale single read after the environment generation changes', async () => {
    await openNotification(null);
    generationRef.current += 1;

    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [{ id: notificationId, readAt: '2026-10-21T00:01:00.000Z' }],
        },
      }),
    );

    assert.deepEqual(analyticsCalls, [['notification_opened', { kind: 'follow' }]]);
  });
});
