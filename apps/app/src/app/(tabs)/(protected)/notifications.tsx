import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
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
    <RouteBoundary
      error={(retry) => <NotificationListState onRetry={retry} state="error" />}
      loading={<NotificationListState state="loading" />}
      title="알림을 불러오지 못했어요"
    >
      <NotificationsContent />
    </RouteBoundary>
  );
}

function NotificationsContent() {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<NotificationsPageQuery>(
    NotificationsQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? (
    <NotificationList profile={profile} />
  ) : (
    <NotificationListState state="profileRequired" />
  );
}
