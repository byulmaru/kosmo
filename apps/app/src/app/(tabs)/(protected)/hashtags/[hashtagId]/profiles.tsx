import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { acquireProfileHashtagExplorationTracker } from '@/analytics/profileHashtagExploration';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { useAnalyticsAccountId, useAnalyticsIdentityAccountId } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
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
  const router = useRouter();
  const theme = useTheme();
  const backButton = (
    <IconButton
      accessibilityLabel="뒤로 가기"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      style={styles.back}
      targetSize={44}
      visualSize={44}
    >
      <ArrowLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );

  return hashtagId ? (
    <HashtagRelatedProfilesRoute backButton={backButton} hashtagId={hashtagId} key={hashtagId} />
  ) : (
    <HashtagRelatedProfileListState leading={backButton} state="notFound" />
  );
}

function HashtagRelatedProfilesRoute({
  backButton,
  hashtagId,
}: {
  backButton: ReactNode;
  hashtagId: string;
}) {
  const tracking = useProfileHashtagExploration(hashtagId);
  return (
    <RouteBoundary
      error={(retry) => (
        <TrackedInitialFailure onInitialFailure={tracking.onInitialFailure}>
          <HashtagRelatedProfileListState leading={backButton} onRetry={retry} state="error" />
        </TrackedInitialFailure>
      )}
      loading={<HashtagRelatedProfileListState leading={backButton} state="loading" />}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent
        backButton={backButton}
        hashtagId={hashtagId}
        tracking={tracking}
      />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({
  backButton,
  hashtagId,
  tracking,
}: {
  backButton: ReactNode;
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
      leading={backButton}
      onInitialResults={tracking.onInitialResults}
      onPaginationFailure={tracking.onPaginationFailure}
      onResultSelected={tracking.onResultSelected}
    />
  ) : (
    <TrackedInitialFailure onInitialFailure={tracking.onInitialFailure}>
      <HashtagRelatedProfileListState leading={backButton} state="notFound" />
    </TrackedInitialFailure>
  );
}

function useProfileHashtagExploration(hashtagId: string) {
  const accountId = useAnalyticsAccountId();
  const identityAccountId = useAnalyticsIdentityAccountId();
  const [retainedTracker, setRetainedTracker] = useState<{
    accountId: string;
    tracker: ProfileHashtagExplorationTracker;
  } | null>(null);

  useEffect(() => {
    const lease = identityAccountId
      ? acquireProfileHashtagExplorationTracker(identityAccountId, hashtagId)
      : null;
    setRetainedTracker(
      lease && identityAccountId ? { accountId: identityAccountId, tracker: lease.tracker } : null,
    );

    return () => lease?.release();
  }, [hashtagId, identityAccountId]);

  const tracker =
    accountId && retainedTracker?.accountId === accountId ? retainedTracker.tracker : null;

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

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
});
