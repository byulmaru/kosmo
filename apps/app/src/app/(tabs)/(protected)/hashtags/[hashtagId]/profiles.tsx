import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  consumeProfileHashtagExploration,
  createProfileHashtagExplorationTracker,
} from '@/analytics/profileHashtagExploration';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import type { ReactNode } from 'react';
import type { ProfileHashtagExplorationTracker } from '@/analytics/profileHashtagExploration';
import type { HashtagRelatedProfilesPageQuery } from './__generated__/HashtagRelatedProfilesPageQuery.graphql';

const HashtagRelatedProfilesQuery = graphql`
  query HashtagRelatedProfilesPageQuery($id: ID!) {
    node(id: $id) {
      __typename
      ... on Hashtag {
        id
        name
        ...HashtagRelatedProfileList_hashtag @alias(as: "relatedProfileList")
      }
    }
  }
`;

export default function HashtagRelatedProfilesScreen() {
  const { hashtagId: rawHashtagId } = useLocalSearchParams<{
    hashtagId?: string | string[];
  }>();
  const hashtagId = typeof rawHashtagId === 'string' && rawHashtagId ? rawHashtagId : null;

  return hashtagId ? (
    <HashtagRelatedProfilesRoute hashtagId={hashtagId} key={hashtagId} />
  ) : (
    <HashtagRelatedProfileListState state="notFound" />
  );
}

function HashtagRelatedProfilesRoute({ hashtagId }: { hashtagId: string }) {
  const tracking = useProfileHashtagExploration(hashtagId);

  return (
    <RouteBoundary
      error={(retry) => (
        <TrackedInitialFailure onInitialFailure={tracking.onInitialFailure}>
          <HashtagRelatedProfileListState onRetry={retry} state="error" />
        </TrackedInitialFailure>
      )}
      loading={<HashtagRelatedProfileListState state="loading" />}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent hashtagId={hashtagId} tracking={tracking} />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({
  hashtagId,
  tracking,
}: {
  hashtagId: string;
  tracking: ReturnType<typeof useProfileHashtagExploration>;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<HashtagRelatedProfilesPageQuery>(
    HashtagRelatedProfilesQuery,
    { id: hashtagId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.node?.__typename === 'Hashtag' && data.node.relatedProfileList ? (
    <HashtagRelatedProfileList
      hashtag={data.node.relatedProfileList}
      onInitialResults={tracking.onInitialResults}
      onPaginationFailure={tracking.onPaginationFailure}
      onResultSelected={tracking.onResultSelected}
    />
  ) : (
    <TrackedInitialFailure onInitialFailure={tracking.onInitialFailure}>
      <HashtagRelatedProfileListState state="notFound" />
    </TrackedInitialFailure>
  );
}

function useProfileHashtagExploration(hashtagId: string) {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const [tracker, setTracker] = useState<ProfileHashtagExplorationTracker | null>(null);

  useEffect(() => {
    const session = consumeProfileHashtagExploration(hashtagId);
    const nextTracker = session ? createProfileHashtagExplorationTracker(session) : null;
    setTracker(nextTracker);

    return () => nextTracker?.end();
  }, [actorLifecycleKey, hashtagId]);

  const onInitialFailure = useCallback(() => tracker?.recordInitialFailure(), [tracker]);
  const onInitialResults = useCallback(
    (hasResults: boolean) => tracker?.recordInitialResults(hasResults),
    [tracker],
  );
  const onPaginationFailure = useCallback(() => tracker?.recordPaginationFailure(), [tracker]);
  const onResultSelected = useCallback(() => tracker?.recordResultSelected(), [tracker]);

  return { onInitialFailure, onInitialResults, onPaginationFailure, onResultSelected };
}

function TrackedInitialFailure({
  children,
  onInitialFailure,
}: {
  children: ReactNode;
  onInitialFailure: () => void;
}) {
  useEffect(() => onInitialFailure(), [onInitialFailure]);
  return children;
}
