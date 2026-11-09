import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { NotificationRouteFrame } from '@/components/notification/NotificationRouteFrame';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import type { NotificationsPageQuery } from './__generated__/NotificationsPageQuery.graphql';

const NotificationsQuery = graphql`
  query NotificationsPageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...NotificationList_profile
      }
    }
  }
`;

export default function NotificationsScreen() {
  return (
    <NotificationRouteFrame>
      <RouteBoundary
        error={(retry) => <NotificationListState onRetry={retry} state="error" />}
        loading={<NotificationListState state="loading" />}
        title="알림을 불러오지 못했어요"
      >
        <NotificationsContent />
      </RouteBoundary>
    </NotificationRouteFrame>
  );
}

function NotificationsContent() {
  const { fetchKey, refetch } = useRouteBoundary();
  const isFocused = useIsFocused();
  const hasBeenFocused = useRef(false);
  useEffect(() => {
    if (!isFocused) {
      return;
    }
    if (hasBeenFocused.current) {
      refetch();
    } else {
      hasBeenFocused.current = true;
    }
  }, [isFocused, refetch]);

  const data = useLazyLoadQuery<NotificationsPageQuery>(
    NotificationsQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? (
    <NotificationList active={isFocused} profile={profile} />
  ) : (
    <NotificationListState state="profileRequired" />
  );
}
