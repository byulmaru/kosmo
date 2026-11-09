import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback } from 'react';
import { graphql, usePreloadedQuery, useQueryLoader } from 'react-relay';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { NotificationRouteFrame } from '@/components/notification/NotificationRouteFrame';
import { RouteBoundary } from '@/components/RouteBoundary';
import type { PreloadedQuery } from 'react-relay';
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
  const [queryReference, loadQuery] = useQueryLoader<NotificationsPageQuery>(NotificationsQuery);
  const isFocused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      loadQuery({}, { fetchPolicy: 'store-and-network' });
    }, [loadQuery]),
  );

  return (
    <NotificationRouteFrame>
      <RouteBoundary
        error={(resetErrorBoundary) => (
          <NotificationListState
            onRetry={() => {
              loadQuery({}, { fetchPolicy: 'network-only' });
              resetErrorBoundary();
            }}
            state="error"
          />
        )}
        loading={<NotificationListState state="loading" />}
        title="알림을 불러오지 못했어요"
      >
        {queryReference ? (
          <NotificationsContent isFocused={isFocused} queryReference={queryReference} />
        ) : (
          <NotificationListState state="loading" />
        )}
      </RouteBoundary>
    </NotificationRouteFrame>
  );
}

function NotificationsContent({
  isFocused,
  queryReference,
}: {
  isFocused: boolean;
  queryReference: PreloadedQuery<NotificationsPageQuery>;
}) {
  const data = usePreloadedQuery<NotificationsPageQuery>(NotificationsQuery, queryReference);
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? (
    <NotificationList active={isFocused} profile={profile} />
  ) : (
    <NotificationListState state="profileRequired" />
  );
}
