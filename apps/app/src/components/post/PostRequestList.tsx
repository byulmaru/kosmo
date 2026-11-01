import { Fragment, useCallback } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { usePaginationScrollContext } from '@/components/pagination/PaginationScrollView';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import {
  POST_REQUEST_HOME_ACTIVE_STATUSES,
  reconcilePublishedPostInHome,
} from './postRequestCache';
import { PostRequestCard } from './PostRequestCard';
import type { ReactElement } from 'react';
import type { PostRequestList_request$key } from './__generated__/PostRequestList_request.graphql';
import type { PostRequestListQuery } from './__generated__/PostRequestListQuery.graphql';

const PostRequestListRequestFragment = graphql`
  fragment PostRequestList_request on PostRequest @relay(plural: true) {
    id
    requestId
    status
    ...PostRequestCard_request
  }
`;

const PostRequestListQuery = graphql`
  query PostRequestListQuery($profileId: ID!) {
    node(id: $profileId) {
      __typename
      ... on Profile {
        id
        postRequests {
          id
          ...PostRequestList_request
        }
      }
    }
  }
`;

type PublishedPost = Readonly<{
  authorProfileId: string | null;
  postId: string | null;
  requestNodeId: string;
}>;
type RequestListProps = Readonly<{
  fetchKey?: string;
  focusedRequestId?: string;
  header?: ReactElement | null;
  profileId: string;
  onCompose?: () => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const onPublished = useCallback(
    ({ authorProfileId, postId, requestNodeId }: PublishedPost) => {
      commitLocalUpdate(environment, (store) => {
        reconcilePublishedPostInHome(store, {
          authorProfileId,
          currentProfileId: selectedProfileId,
          postId,
          profileId,
          requestNodeId,
        });
      });
    },
    [environment, profileId, selectedProfileId],
  );

  return { onPublished };
}

export function PostRequestList({
  fetchKey,
  focusedRequestId,
  header,
  onCompose,
  profileId,
}: RequestListProps) {
  const hasPaginationScrollContext = usePaginationScrollContext();
  const hasNativeScrollParent = Platform.OS !== 'web' && hasPaginationScrollContext;
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { profileId },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const profile = data.node?.__typename === 'Profile' ? data.node : null;
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    profile?.postRequests ?? [],
  );
  const focusedRequest = focusedRequestId
    ? (requests.find((request) => request.requestId === focusedRequestId) ?? null)
    : null;
  const displayRequests = focusedRequest
    ? requests.filter((request) => request.id !== focusedRequest.id)
    : requests;
  const { onPublished } = usePostRequestCardHandlers(profileId);

  const empty = <StateView style={styles.empty} title="작성 요청이 없어요" />;
  const listHeader = focusedRequest ? (
    <>
      {header}
      <PostRequestCard onCompose={onCompose} onPublished={onPublished} request={focusedRequest} />
    </>
  ) : (
    header
  );

  const emptyList = displayRequests.length === 0 && !focusedRequest ? empty : null;
  const key = `post-requests:${profileId}`;
  const renderRequest = (request: (typeof displayRequests)[number]) => (
    <PostRequestCard onCompose={onCompose} onPublished={onPublished} request={request} />
  );

  if (Platform.OS === 'web' || hasNativeScrollParent) {
    return (
      <View key={key} style={styles.root}>
        {listHeader}
        {displayRequests.length === 0
          ? emptyList
          : displayRequests.map((request) => (
              <Fragment key={request.id}>{renderRequest(request)}</Fragment>
            ))}
      </View>
    );
  }

  return (
    <FlatList
      data={displayRequests}
      key={key}
      keyExtractor={(request) => request.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={emptyList}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => renderRequest(item)}
      style={[styles.root, styles.nativeList]}
    />
  );
}

export function PostRequestListSummary({
  fetchKey,
  onCompose,
  profileId,
}: {
  fetchKey?: string;
  onCompose?: () => void;
  profileId: string;
}) {
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { profileId },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const profile = data.node?.__typename === 'Profile' ? data.node : null;
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    profile?.postRequests ?? [],
  );
  const { onPublished } = usePostRequestCardHandlers(profileId);

  const request = requests.find(
    (item) =>
      POST_REQUEST_HOME_ACTIVE_STATUSES.some((status) => status === item.status) ||
      item.status === 'PUBLISHED',
  );
  return request ? (
    <PostRequestCard onCompose={onCompose} onPublished={onPublished} request={request} />
  ) : null;
}

export function PostRequestHomeSummaryFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.summaryError}>
      <Text accessibilityRole="alert" style={[styles.summaryErrorText, { color: theme.danger }]}>
        게시 요청을 확인하지 못했어요
      </Text>
      <Button onPress={onRetry} size="compact" tone="secondary">
        다시 확인
      </Button>
    </View>
  );
}

export function PostRequestHomeSummaryLoading() {
  const theme = useTheme();

  return (
    <View style={styles.summaryLoading}>
      <ActivityIndicator
        accessibilityLabel="게시 요청을 불러오는 중"
        color={theme.foregroundSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  empty: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  nativeList: { flex: 1 },
  summaryError: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryErrorText: { fontFamily: fontFamilies.ui, ...typography.sm },
  summaryLoading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
