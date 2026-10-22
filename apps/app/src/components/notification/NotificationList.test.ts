import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { NotificationList_profile$key } from './__generated__/NotificationList_profile.graphql';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const platform = { OS: 'ios' };
const profileId = 'profile-notifications';
const profile = { id: profileId } as unknown as NotificationList_profile$key;
const initialEdges = [
  {
    node: {
      __typename: 'FollowNotification',
      follow: { id: 'notification-unread-a', readAt: null },
      id: 'notification-unread-a',
      readAt: null,
    },
  },
  {
    node: {
      __typename: 'FollowNotification',
      follow: { id: 'notification-read', readAt: '2026-10-23T00:00:00Z' },
      id: 'notification-read',
      readAt: '2026-10-23T00:00:00Z',
    },
  },
  {
    node: {
      __typename: 'FollowNotification',
      follow: { id: 'notification-unread-b', readAt: null },
      id: 'notification-unread-b',
      readAt: null,
    },
  },
];

let paginationData: { id: string; notifications: { edges: typeof initialEdges } };
let paginationRefetches: Array<{
  options: { fetchPolicy: string; onComplete?: (error: Error | null) => void };
  variables: { count: number };
}>;
let currentMutation:
  | {
      onCompleted?: (response: unknown, errors?: ReadonlyArray<unknown>) => void;
      onError?: (error: Error) => void;
      variables: { ids: string[] };
    }
  | undefined;
let settleMutation: (() => void) | undefined;
let currentUnreadTarget: ReadonlyArray<string> | null;
let renderer: ReactTestRenderer | null = null;
let events: string[];
let toasts: Array<{
  message: string;
  options: { action?: { label: string; onPress: () => void }; tone?: string; persistent?: boolean };
}>;
let NotificationList: ComponentType<{ profile: NotificationList_profile$key }>;

type MockViewProps = PropsWithChildren<Record<string, unknown>>;
const MockScrollView = (props: MockViewProps) => createElement('ScrollView', props, props.children);
const MockRefreshControl = () => null;
const MockNotificationRow = ({ id, readAt }: { id: string; readAt: string | null | undefined }) =>
  createElement('NotificationRow', { id, readAt });

const resetPagination = () => {
  paginationData = { id: profileId, notifications: { edges: initialEdges } };
  paginationRefetches = [];
  currentMutation = undefined;
  settleMutation = undefined;
  currentUnreadTarget = ['notification-unread-a', 'notification-unread-b'];
  events = [];
  toasts = [];
};

const commitRead = (config: NonNullable<typeof currentMutation>) => {
  currentMutation = config;
  events.push('mark');
};

const completeRead = () => {
  currentMutation?.onCompleted?.(
    {
      markNotificationRead: {
        notifications: [
          { id: 'notification-unread-a', readAt: '2026-10-23T01:00:00Z' },
          { id: 'notification-unread-b', readAt: '2026-10-23T01:00:00Z' },
        ],
        recipientProfiles: [{ id: profileId, unreadNotificationCount: 0 }],
      },
    },
    [],
  );
  settleMutation?.();
};

mockModule('expo-router', { usePathname: () => '/notifications', useSegments: () => [] });
mockModule('react-native', {
  Platform: platform,
  RefreshControl: MockRefreshControl,
  ScrollView: MockScrollView,
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390 }),
});
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => {
    const [inFlight, setInFlight] = useState(false);
    settleMutation = () => setInFlight(false);
    return [
      (config: NonNullable<typeof currentMutation>) => {
        setInFlight(true);
        commitRead(config);
      },
      inFlight,
    ];
  },
  usePaginationFragment: () => ({
    data: paginationData,
    hasNext: false,
    isLoadingNext: false,
    loadNext: () => undefined,
    refetch: (
      variables: { count: number },
      options: { fetchPolicy: string; onComplete?: (error: Error | null) => void },
    ) => {
      events.push('refetch');
      paginationRefetches.push({ options, variables });
    },
  }),
});
mockModule('@/components/PageHeader', { PageHeader: () => null });
mockModule('@/components/pagination/PaginationSurface', { PaginationSurface: () => null });
mockModule('@/components/pagination/useAutomaticPagination', {
  useAutomaticPagination: () => ({
    endRef: null,
    loadError: null,
    loadNextPage: () => undefined,
    nativeScrollProps: {},
    resetError: () => undefined,
  }),
});
mockModule('@/components/post/PostActionAuthentication', {
  PostActionAuthenticationProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/post/PostComposerCoordinator', {
  PostComposerCoordinatorProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/post/PostMediaViewerHost', {
  PostMediaViewerHostProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/shellLayout', { getWebMobileShellHeader: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: (typeof toasts)[number]['options']) => {
      toasts.push({ message, options });
      return () => undefined;
    },
  }),
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ border: '#ddd', text: '#111' }) });
mockModule('@/theme/tokens', {
  spacing: { lg: 16, md: 12, sm: 8, xxxl: 48 },
});
mockModule('./NotificationListItem', {
  FollowRequestNotificationListItem: () => null,
  MentionNotificationListItem: () => null,
  NotificationListItem: ({
    notification,
  }: {
    notification: { id: string; readAt: string | null };
  }) => createElement(MockNotificationRow, { id: notification.id, readAt: notification.readAt }),
  OperationalNotificationListItem: () => null,
  QuoteNotificationListItem: () => null,
  ReactionNotificationListItem: () => null,
  ReplyNotificationListItem: () => null,
  RepostNotificationListItem: () => null,
});
mockModule('./NotificationReadAllContext', {
  NotificationReadAllAction: () => null,
  useNotificationReadAll: () => ({
    getCurrentTarget: () => currentUnreadTarget,
    publishUnreadIds: () => () => undefined,
  }),
});

before(async () => {
  ({ NotificationList } = await import('./NotificationList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'ios';
  resetPagination();
});

function refreshControl() {
  return renderer?.root.findByType(MockScrollView).props.refreshControl;
}

describe('NotificationList native refresh', () => {
  it('읽지 않은 현재 ID만 먼저 읽고 성공한 뒤 refetch하며 새 unread를 유지한다', async () => {
    resetPagination();
    await act(async () => {
      renderer = create(createElement(NotificationList, { profile }));
    });

    await act(async () => refreshControl()?.props.onRefresh());
    await act(async () => refreshControl()?.props.onRefresh());

    assert.deepEqual(events, ['mark']);
    assert.deepEqual(currentMutation?.variables, {
      ids: ['notification-unread-a', 'notification-unread-b'],
    });
    assert.equal(paginationRefetches.length, 0);

    await act(async () => completeRead());
    assert.deepEqual(events, ['mark', 'refetch']);
    assert.deepEqual(paginationRefetches[0]?.variables, { count: 20 });
    assert.equal(paginationRefetches[0]?.options.fetchPolicy, 'network-only');

    paginationData = {
      id: profileId,
      notifications: {
        edges: [
          {
            node: {
              __typename: 'FollowNotification',
              follow: { id: 'notification-new-unread', readAt: null },
              id: 'notification-new-unread',
              readAt: null,
            },
          },
        ],
      },
    } as typeof paginationData;
    await act(async () => paginationRefetches[0]?.options.onComplete?.(null));
    await act(async () => renderer?.update(createElement(NotificationList, { profile })));

    assert.deepEqual(renderer?.root.findByType(MockNotificationRow).props, {
      id: 'notification-new-unread',
      readAt: null,
    });
  });

  it('현재 unread가 없으면 읽음 mutation 없이 바로 refetch한다', async () => {
    resetPagination();
    paginationData.notifications.edges = paginationData.notifications.edges.map(({ node }) => ({
      node: {
        ...node,
        follow: { ...node.follow, readAt: '2026-10-23T00:00:00Z' },
        readAt: '2026-10-23T00:00:00Z',
      },
    }));
    currentUnreadTarget = [];
    await act(async () => {
      renderer = create(createElement(NotificationList, { profile }));
    });

    await act(async () => refreshControl()?.props.onRefresh());

    assert.deepEqual(events, ['refetch']);
    assert.equal(currentMutation, undefined);
  });

  it('읽음 실패 시 refetch하지 않고 기존 toast 재시도를 연결한다', async () => {
    resetPagination();
    await act(async () => {
      renderer = create(createElement(NotificationList, { profile }));
    });

    await act(async () => refreshControl()?.props.onRefresh());
    await act(async () => {
      currentMutation?.onError?.(new Error('network'));
      settleMutation?.();
    });

    assert.deepEqual(events, ['mark']);
    assert.equal(paginationRefetches.length, 0);
    assert.equal(toasts[0]?.options.action?.label, '다시 시도');
    assert.equal(toasts[0]?.options.tone, 'danger');

    await act(async () => toasts[0]?.options.action?.onPress());
    assert.deepEqual(events, ['mark', 'mark']);
  });

  it('읽음 실패 뒤 현재 actor target이 사라지면 toast 재시도를 실행하지 않는다', async () => {
    resetPagination();
    await act(async () => {
      renderer = create(createElement(NotificationList, { profile }));
    });

    await act(async () => refreshControl()?.props.onRefresh());
    await act(async () => {
      currentMutation?.onError?.(new Error('network'));
      settleMutation?.();
    });
    currentUnreadTarget = null;

    await act(async () => toasts[0]?.options.action?.onPress());

    assert.deepEqual(events, ['mark']);
    assert.equal(paginationRefetches.length, 0);
  });
});
