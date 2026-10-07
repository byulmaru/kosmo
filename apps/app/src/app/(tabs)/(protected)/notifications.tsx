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
      }
      ...NotificationList_session
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
  const session = data.currentSession ?? null;

  return session ? (
    <NotificationList session={session} />
  ) : (
    <NotificationListState state="profileRequired" />
  );
}
