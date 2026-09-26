import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { IconButton } from '@/components/ui/IconButton';
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
  return (
    <RouteBoundary
      error={(retry) => (
        <HashtagRelatedProfileListState leading={backButton} onRetry={retry} state="error" />
      )}
      loading={<HashtagRelatedProfileListState leading={backButton} state="loading" />}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent backButton={backButton} hashtagId={hashtagId} />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({
  backButton,
  hashtagId,
}: {
  backButton: ReactNode;
  hashtagId: string;
}) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<HashtagRelatedProfilesPageQuery>(
    HashtagRelatedProfilesQuery,
    { id: hashtagId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.node?.__typename === 'Hashtag' && data.node.relatedProfileList ? (
    <HashtagRelatedProfileList hashtag={data.node.relatedProfileList} leading={backButton} />
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
