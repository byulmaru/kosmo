import { graphql, useLazyLoadQuery } from 'react-relay';
import { BookmarkConnectionList } from '@/components/bookmark/BookmarkConnectionList';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
  const { selectedProfileId, status } = useSession();

  if (status !== 'error' && !selectedProfileId) {
    return <BookmarkList profileRequired />;
  }

  return (
    <RouteBoundary
      error={(retry) => <BookmarkList error onRetry={retry} />}
      key={selectedProfileId ?? 'profile-required'}
      loading={<BookmarkList loading />}
      title="북마크 목록을 불러오지 못했어요"
    >
      <BookmarksContent />
    </RouteBoundary>
  );
}

function BookmarksContent() {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<BookmarksPageQuery>(
    BookmarksQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  return profile ? <BookmarkConnectionList profile={profile} /> : <BookmarkList profileRequired />;
}
