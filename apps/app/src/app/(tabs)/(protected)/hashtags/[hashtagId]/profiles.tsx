import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  HashtagRelatedProfileList,
  HashtagRelatedProfileListState,
} from '@/components/profile/HashtagRelatedProfileList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
  const { revision } = useRelayActor();

  return hashtagId ? (
    <HashtagRelatedProfilesRoute
      hashtagId={hashtagId}
      key={`${revision}:${hashtagId}`}
      revision={revision}
    />
  ) : (
    <HashtagRelatedProfileListState state="notFound" />
  );
}

function HashtagRelatedProfilesRoute({
  hashtagId,
  revision,
}: {
  hashtagId: string;
  revision: number;
}) {
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <RouteBoundary
      error={(retry) => <HashtagRelatedProfileListState onRetry={retry} state="error" />}
      loading={<HashtagRelatedProfileListState state="loading" />}
      onRetry={() => setFetchKey((value) => value + 1)}
      title="관련 프로필을 불러오지 못했어요"
    >
      <HashtagRelatedProfilesContent fetchKey={`${revision}:${fetchKey}`} hashtagId={hashtagId} />
    </RouteBoundary>
  );
}

function HashtagRelatedProfilesContent({
  fetchKey,
  hashtagId,
}: {
  fetchKey: string;
  hashtagId: string;
}) {
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
