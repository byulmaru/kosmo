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
  getCurrentTarget: () => ReadonlyArray<string> | null;
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
  const actorLifecycleKeyRef = useRef(actorLifecycleKey);
  actorLifecycleKeyRef.current = actorLifecycleKey;
  const [publishedUnreadIds, setPublishedUnreadIds] = useState<PublishedUnreadIds | null>(null);
  const publishedUnreadIdsRef = useRef<PublishedUnreadIds | null>(null);
  const publishUnreadIds = useCallback(
    (unreadIds: ReadonlyArray<string>) => {
      const next = { actorLifecycleKey, unreadIds };
      publishedUnreadIdsRef.current = next;
      setPublishedUnreadIds(next);
      return () => {
        if (publishedUnreadIdsRef.current !== next) {
          return;
        }
        publishedUnreadIdsRef.current = null;
        setPublishedUnreadIds((current) => (current === next ? null : current));
      };
    },
    [actorLifecycleKey],
  );
  const getCurrentTarget = useCallback(() => {
    const current = publishedUnreadIdsRef.current;
    return actorLifecycleKeyRef.current === actorLifecycleKey &&
      current?.actorLifecycleKey === actorLifecycleKey
      ? current.unreadIds
      : null;
  }, [actorLifecycleKey]);
  const unreadIds =
    publishedUnreadIds?.actorLifecycleKey === actorLifecycleKey
      ? publishedUnreadIds.unreadIds
      : noUnreadIds;
  const value = useMemo(
    () => ({ getCurrentTarget, publishUnreadIds, unreadIds }),
    [getCurrentTarget, publishUnreadIds, unreadIds],
  );

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
  const { getCurrentTarget, unreadIds } = useNotificationReadAll();
  const { showToast } = useToast();
  const [commitMarkAllRead, isMarkAllReadInFlight] =
    useMutation<NotificationListMarkAllReadMutation>(markAllReadMutation);
  const readAllInFlight = useRef(false);

  useEffect(() => {
    return () => {
      readAllInFlight.current = false;
    };
  }, []);

  const markAllRead = useCallback(() => {
    const target = getCurrentTarget();
    if (!target || readAllInFlight.current || isMarkAllReadInFlight) {
      return;
    }

    if (target.length === 0) {
      return;
    }

    readAllInFlight.current = true;
    const handleFailure = () => {
      readAllInFlight.current = false;
      if (!getCurrentTarget()?.length) {
        return;
      }
      showToast('알림을 모두 읽지 못했어요.', {
        action: { label: '다시 시도', onPress: markAllRead },
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
      variables: { ids: [...target] },
    });
  }, [commitMarkAllRead, getCurrentTarget, isMarkAllReadInFlight, showToast]);

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
