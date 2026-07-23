import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { BookmarkConnectionList } from '@/components/bookmark/BookmarkConnectionList';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import type { BookmarksPageQuery } from './__generated__/BookmarksPageQuery.graphql';

const BookmarksQuery = graphql`
  query BookmarksPageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...BookmarkConnectionList_profile
      }
    }
  }
`;

export default function BookmarksScreen() {
  const { revision } = useRelayActor();
  const { selectedProfileId, status } = useSession();
  const [fetchKey, setFetchKey] = useState(0);

  if (status !== 'error' && !selectedProfileId) {
    return <BookmarkList profileRequired />;
  }

  return (
    <RouteBoundary
      error={(retry) => <BookmarkList error onRetry={retry} />}
      key={`${revision}:${selectedProfileId}`}
      loading={<BookmarkList loading />}
      onRetry={() => setFetchKey((key) => key + 1)}
      title="북마크 목록을 불러오지 못했어요"
    >
      <BookmarksContent fetchKey={`${revision}:${selectedProfileId}:${fetchKey}`} />
    </RouteBoundary>
  );
}

function BookmarksContent({ fetchKey }: { fetchKey: string }) {
  const data = useLazyLoadQuery<BookmarksPageQuery>(
    BookmarksQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? <BookmarkConnectionList profile={profile} /> : <BookmarkList profileRequired />;
}
