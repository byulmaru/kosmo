import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  NotificationList,
  NotificationListState,
} from '@/components/notification/NotificationList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      error={(retry) => <NotificationListState onRetry={retry} state="error" />}
      loading={<NotificationListState state="loading" />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="알림을 불러오지 못했어요"
    >
      <NotificationsContent fetchKey={`${revision}:${fetchKey}`} />
    </RouteBoundary>
  );
}

function NotificationsContent({ fetchKey }: { fetchKey: string }) {
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
