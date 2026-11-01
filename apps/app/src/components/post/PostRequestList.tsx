import { Fragment, useCallback, useEffect } from 'react';
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
  removePostRequestFromHomeRequests,
} from './postRequestCache';
import { PostRequestCard } from './PostRequestCard';
import type { ReactElement } from 'react';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestList_request$key } from './__generated__/PostRequestList_request.graphql';
import type { PostRequestListQuery } from './__generated__/PostRequestListQuery.graphql';

const PostRequestListRequestFragment = graphql`
  fragment PostRequestList_request on PostRequest @relay(plural: true) {
    id
    requestId
    status
    post {
      id
      profile {
        id
      }
    }
    ...PostRequestCard_request
  }
`;

const PostRequestListQuery = graphql`
  query PostRequestListQuery($profileId: ID!, $statuses: [PostRequestStatus!]) {
    postRequests(profileId: $profileId, statuses: $statuses) {
      id
      ...PostRequestList_request
    }
  }
`;

type PublishedPost = Readonly<{
  authorProfileId: string | null;
  postId: string | null;
  requestNodeId: string;
}>;
type CancelledRequest = Readonly<{ requestNodeId: string }>;

type RequestListProps = Readonly<{
  fetchKey?: string;
  focusedRequestId?: string;
  focusedRequest?: PostRequestCard_request$key | null;
  header?: ReactElement | null;
  profileId: string;
  onCompose?: () => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const onCancelled = useCallback(
    ({ requestNodeId }: CancelledRequest) => {
      commitLocalUpdate(environment, (store) => {
        removePostRequestFromHomeRequests(store, profileId, requestNodeId);
      });
    },
    [environment, profileId],
  );
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

  return { onCancelled, onPublished };
}

export function PostRequestList({
  fetchKey,
  focusedRequestId,
  focusedRequest,
  header,
  onCompose,
  profileId,
}: RequestListProps) {
  const hasPaginationScrollContext = usePaginationScrollContext();
  const hasNativeScrollParent = Platform.OS !== 'web' && hasPaginationScrollContext;
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { profileId, statuses: null },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    data.postRequests,
  );
  const displayRequests = requests.filter((request) => request.requestId !== focusedRequestId);
  const { onCancelled, onPublished } = usePostRequestCardHandlers(profileId);

  const empty = <StateView style={styles.empty} title="작성 요청이 없어요" />;
  const listHeader = focusedRequest ? (
    <>
      {header}
      <PostRequestCard
        onCancelled={onCancelled}
        onCompose={onCompose}
        onPublished={onPublished}
        request={focusedRequest}
      />
    </>
  ) : (
    header
  );

  const emptyList = displayRequests.length === 0 && !focusedRequestId ? empty : null;
  const key = `post-requests:${profileId}`;
  const renderRequest = (request: (typeof displayRequests)[number]) => (
    <PostRequestCard
      onCancelled={onCancelled}
      onCompose={onCompose}
      onPublished={onPublished}
      request={request}
    />
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
    { profileId, statuses: POST_REQUEST_HOME_ACTIVE_STATUSES },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    data.postRequests,
  );
  const { onCancelled, onPublished } = usePostRequestCardHandlers(profileId);

  useEffect(() => {
    for (const request of requests) {
      if (request.status === 'PUBLISHED') {
        onPublished({
          authorProfileId: request.post?.profile?.id ?? null,
          postId: request.post?.id ?? null,
          requestNodeId: request.id,
        });
      } else if (request.status === 'CANCELLED') {
        onCancelled({ requestNodeId: request.id });
      }
    }
  }, [onCancelled, onPublished, requests]);

  const request = requests.find((item) =>
    POST_REQUEST_HOME_ACTIVE_STATUSES.some((status) => status === item.status),
  );
  return request ? (
    <PostRequestCard
      onCancelled={onCancelled}
      onCompose={onCompose}
      onPublished={onPublished}
      request={request}
    />
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
