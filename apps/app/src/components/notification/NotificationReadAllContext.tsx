import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import type { PropsWithChildren, ReactNode } from 'react';
import type { NotificationListMarkAllReadMutation } from './__generated__/NotificationListMarkAllReadMutation.graphql';

type PublishedUnreadIds = Readonly<{
  actorLifecycleKey: string;
  unreadIds: ReadonlyArray<string>;
}>;

type NotificationReadAllContextValue = Readonly<{
  publishUnreadIds: (unreadIds: ReadonlyArray<string>) => () => void;
  unreadIds: ReadonlyArray<string>;
}>;

const NotificationReadAllContext = createContext<NotificationReadAllContextValue | null>(null);
const noUnreadIds: ReadonlyArray<string> = [];

const markAllReadMutation = graphql`
  mutation NotificationListMarkAllReadMutation($ids: [ID!]!) {
    markNotificationRead(input: { ids: $ids }) {
      notifications {
        id
        readAt
      }
      recipientProfiles {
        id
        unreadNotificationCount
      }
    }
  }
`;

export function NotificationReadAllProvider({ children }: PropsWithChildren): ReactNode {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const [publishedUnreadIds, setPublishedUnreadIds] = useState<PublishedUnreadIds | null>(null);
  const publishUnreadIds = useCallback(
    (unreadIds: ReadonlyArray<string>) => {
      const next = { actorLifecycleKey, unreadIds };
      setPublishedUnreadIds(next);
      return () => {
        setPublishedUnreadIds((current) => (current === next ? null : current));
      };
    },
    [actorLifecycleKey],
  );
  const unreadIds =
    publishedUnreadIds?.actorLifecycleKey === actorLifecycleKey
      ? publishedUnreadIds.unreadIds
      : noUnreadIds;
  const value = useMemo(() => ({ publishUnreadIds, unreadIds }), [publishUnreadIds, unreadIds]);

  return (
    <NotificationReadAllContext.Provider value={value}>
      {children}
    </NotificationReadAllContext.Provider>
  );
}

export function useNotificationReadAll() {
  const context = useContext(NotificationReadAllContext);

  if (!context) {
    throw new Error('useNotificationReadAll must be used within NotificationReadAllProvider.');
  }

  return context;
}

export function NotificationReadAllAction() {
  const { unreadIds } = useNotificationReadAll();
  const { showToast } = useToast();
  const [commitMarkAllRead, isMarkAllReadInFlight] =
    useMutation<NotificationListMarkAllReadMutation>(markAllReadMutation);
  const readAllInFlight = useRef(false);
  const mounted = useRef(false);
  const failureToastCleanup = useRef<(() => void) | null>(null);
  const retryRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readAllInFlight.current = false;
      failureToastCleanup.current?.();
      failureToastCleanup.current = null;
      retryRef.current = () => undefined;
    };
  }, []);

  const markAllRead = useCallback(() => {
    if (!mounted.current || readAllInFlight.current || isMarkAllReadInFlight) {
      return;
    }

    if (unreadIds.length === 0) {
      return;
    }

    readAllInFlight.current = true;
    const handleFailure = () => {
      readAllInFlight.current = false;
      if (!mounted.current) {
        return;
      }
      failureToastCleanup.current?.();
      failureToastCleanup.current = showToast('알림을 모두 읽지 못했어요.', {
        action: { label: '다시 시도', onPress: () => retryRef.current() },
        tone: 'danger',
      });
    };
    commitMarkAllRead({
      onCompleted: (response, errors) => {
        if (errors?.length || response.markNotificationRead == null) {
          handleFailure();
          return;
        }
        readAllInFlight.current = false;
      },
      onError: handleFailure,
      variables: { ids: [...unreadIds] },
    });
  }, [commitMarkAllRead, isMarkAllReadInFlight, showToast, unreadIds]);
  retryRef.current = markAllRead;

  return (
    <Button
      accessibilityLabel="모두 읽음"
      accessibilityState={{
        busy: isMarkAllReadInFlight,
        disabled: isMarkAllReadInFlight || unreadIds.length === 0,
      }}
      aria-busy={isMarkAllReadInFlight || undefined}
      disabled={isMarkAllReadInFlight || unreadIds.length === 0}
      hitSlop={Platform.OS === 'web' ? undefined : 4}
      onPress={markAllRead}
      tone="secondary"
    >
      모두 읽음
    </Button>
  );
}
