import { useLocalSearchParams } from 'expo-router';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
  return (
    <RouteBoundary
      error={(retry) => <HashtagRelatedProfileListState onRetry={retry} state="error" />}
      loading={<HashtagRelatedProfileListState state="loading" />}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent hashtagId={hashtagId} />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({ hashtagId }: { hashtagId: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<HashtagRelatedProfilesPageQuery>(
    HashtagRelatedProfilesQuery,
    { id: hashtagId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );

  return data.node?.__typename === 'Hashtag' && data.node.relatedProfileList ? (
    <HashtagRelatedProfileList hashtag={data.node.relatedProfileList} />
  ) : (
    <HashtagRelatedProfileListState state="notFound" />
  );
}
