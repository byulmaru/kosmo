import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { identifyAnalytics, trackAnalytics } from '@/analytics/client';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { ReactNode } from 'react';
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
  const { accountId } = useSession();
  const recordedAccount = useRef<string | null>(null);
  const onVisibleResults = useCallback(
    (confirmedHashtagId: string, resultCount: number) => {
      if (!accountId || recordedAccount.current === accountId) {
        return;
      }
      recordedAccount.current = accountId;
      identifyAnalytics(accountId);
      trackAnalytics('profile_hashtag_list_viewed', {
        hashtag_id: confirmedHashtagId,
        result_count: resultCount,
      });
    },
    [accountId],
  );
  const onResultSelected = useCallback(
    (confirmedHashtagId: string) => {
      if (!accountId) {
        return;
      }
      identifyAnalytics(accountId);
      trackAnalytics('profile_hashtag_profile_selected', { hashtag_id: confirmedHashtagId });
    },
    [accountId],
  );
  return (
    <RouteBoundary
      error={(retry) => (
        <HashtagRelatedProfileListState leading={backButton} onRetry={retry} state="error" />
      )}
      loading={<HashtagRelatedProfileListState leading={backButton} state="loading" />}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent
        backButton={backButton}
        hashtagId={hashtagId}
        onVisibleResults={onVisibleResults}
        onResultSelected={onResultSelected}
      />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({
  backButton,
  hashtagId,
  onVisibleResults,
  onResultSelected,
}: {
  backButton: ReactNode;
  hashtagId: string;
  onVisibleResults: (hashtagId: string, resultCount: number) => void;
  onResultSelected: (hashtagId: string) => void;
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
      onVisibleResults={onVisibleResults}
      onResultSelected={onResultSelected}
    />
  ) : (
    <HashtagRelatedProfileListState leading={backButton} state="notFound" />
  );
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
