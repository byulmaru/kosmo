import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate, ConnectionHandler } from 'relay-runtime';
import { InfiniteList } from '@/components/pagination/InfiniteList';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import { PostRequestCard } from './PostRequestCard';
import {
  getPostRequestConnectionIds,
  POST_REQUEST_HOME_ACTIVE_STATUSES,
} from './postRequestConnection';
import type { ReactElement } from 'react';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestList_account$key } from './__generated__/PostRequestList_account.graphql';
import type { PostRequestListNextPageQuery } from './__generated__/PostRequestListNextPageQuery.graphql';

const PostRequestListFragment = graphql`
  fragment PostRequestList_account on Account
  @argumentDefinitions(
    count: { type: "Int", defaultValue: 20 }
    cursor: { type: "String" }
    profileId: { type: "ID!" }
    statuses: { type: "[PostRequestStatus!]" }
  )
  @refetchable(queryName: "PostRequestListNextPageQuery") {
    id
    postRequests(profileId: $profileId, first: $count, after: $cursor, statuses: $statuses)
      @connection(key: "PostRequestList_postRequests", filters: ["profileId", "statuses"]) {
      edges {
        cursor
        node {
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
      }
      pageInfo {
        endCursor
        hasNextPage
      }
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
  account: PostRequestList_account$key;
  focusedRequestId?: string;
  focusedRequest?: PostRequestCard_request$key | null;
  header?: ReactElement | null;
  profileId: string;
  onRewrite?: (requestId: string) => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const { accountId, selectedProfileId } = useSession();
  const [, activeConnectionId] = getPostRequestConnectionIds(accountId, profileId);
  const removeActiveRequest = useCallback(
    (requestNodeId: string) => {
      if (!activeConnectionId) {
        return;
      }
      commitLocalUpdate(environment, (store) => {
        const connection = store.get(activeConnectionId);
        if (connection) {
          ConnectionHandler.deleteNode(connection, requestNodeId);
        }
      });
    },
    [activeConnectionId, environment],
  );

  const onPublished = useCallback(
    ({ authorProfileId, postId, requestNodeId }: PublishedPost) => {
      commitLocalUpdate(environment, (store) => {
        const activeConnection = activeConnectionId ? store.get(activeConnectionId) : null;
        if (activeConnection) {
          ConnectionHandler.deleteNode(activeConnection, requestNodeId);
        }

        if (!postId || !authorProfileId || authorProfileId !== selectedProfileId) {
          return;
        }

        const post = store.get(postId);
        const homeConnection = ConnectionHandler.getConnection(
          store.getRoot(),
          'PostList_homeTimeline',
        );
        if (!post || !homeConnection) {
          return;
        }

        const alreadyPresent = (homeConnection.getLinkedRecords('edges') ?? []).some(
          (edge) => edge?.getLinkedRecord('node')?.getDataID() === postId,
        );
        if (alreadyPresent) {
          return;
        }

        const edge = ConnectionHandler.createEdge(
          store,
          homeConnection,
          post,
          'PostConnectionEdge',
        );
        ConnectionHandler.insertEdgeBefore(homeConnection, edge);
      });
    },
    [activeConnectionId, environment, selectedProfileId],
  );
  const onCancelled = useCallback(
    ({ requestNodeId }: CancelledRequest) => removeActiveRequest(requestNodeId),
    [removeActiveRequest],
  );

  return { activeConnectionId, onCancelled, onPublished };
}

export function PostRequestList({
  account,
  focusedRequestId,
  focusedRequest,
  header,
  onRewrite,
  profileId,
}: RequestListProps) {
  const theme = useTheme();
  const pagination = usePaginationFragment<
    PostRequestListNextPageQuery,
    PostRequestList_account$key
  >(PostRequestListFragment, account);
  const edges = (pagination.data.postRequests?.edges ?? []).filter(
    ({ node }) => node.requestId !== focusedRequestId,
  );
  const { activeConnectionId, onCancelled, onPublished } = usePostRequestCardHandlers(profileId);
  const { showToast } = useToast();
  const loadErrorToastCleanup = useRef<(() => void) | null>(null);
  const handleLoadErrorChange = useCallback(
    (loadError: boolean, onRetryNextPage: () => void) => {
      if (loadError && !loadErrorToastCleanup.current) {
        loadErrorToastCleanup.current = showToast('게시 요청을 더 불러오지 못했어요.', {
          action: { label: '다시 시도', onPress: onRetryNextPage },
          tone: 'danger',
        });
      } else if (!loadError && loadErrorToastCleanup.current) {
        loadErrorToastCleanup.current();
        loadErrorToastCleanup.current = null;
      }
    },
    [showToast],
  );
  useEffect(
    () => () => {
      loadErrorToastCleanup.current?.();
      loadErrorToastCleanup.current = null;
    },
    [],
  );

  const empty = <StateView style={styles.empty} title="작성 요청이 없어요" />;
  const listHeader = focusedRequest ? (
    <>
      {header}
      <PostRequestCard
        activeConnectionId={activeConnectionId}
        onCancelled={onCancelled}
        onPublished={onPublished}
        onRewrite={onRewrite}
        request={focusedRequest}
      />
    </>
  ) : (
    header
  );

  return (
    <InfiniteList
      data={edges}
      empty={edges.length === 0 && !focusedRequestId ? empty : null}
      hasNext={pagination.hasNext}
      isLoadingNext={pagination.isLoadingNext}
      key={`post-requests:${pagination.data.id}:${profileId}`}
      keyExtractor={(edge) => edge.node.id}
      loadNext={pagination.loadNext}
      onLoadErrorChange={handleLoadErrorChange}
      pageSize={20}
      header={listHeader}
      footer={
        pagination.isLoadingNext ? (
          <View style={styles.loadingNext}>
            <ActivityIndicator
              accessibilityLabel="게시 요청을 더 불러오는 중"
              color={theme.foregroundSecondary}
            />
            <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
              게시 요청을 더 불러오는 중입니다.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <PostRequestCard
          activeConnectionId={activeConnectionId}
          onCancelled={onCancelled}
          onPublished={onPublished}
          onRewrite={onRewrite}
          request={item.node}
        />
      )}
      style={styles.root}
    />
  );
}

export function PostRequestListSummary({
  account,
  onRewrite,
  profileId,
}: {
  account: PostRequestList_account$key;
  onRewrite: (requestId: string) => void;
  profileId: string;
}) {
  const pagination = usePaginationFragment<
    PostRequestListNextPageQuery,
    PostRequestList_account$key
  >(PostRequestListFragment, account);
  const { activeConnectionId, onCancelled, onPublished } = usePostRequestCardHandlers(profileId);
  const edges = pagination.data.postRequests?.edges ?? [];

  useEffect(() => {
    for (const { node } of edges) {
      if (node.status === 'PUBLISHED') {
        onPublished({
          authorProfileId: node.post?.profile.id ?? null,
          postId: node.post?.id ?? null,
          requestNodeId: node.id,
        });
      } else if (node.status === 'CANCELLED') {
        onCancelled({ requestNodeId: node.id });
      }
    }
  }, [edges, onCancelled, onPublished]);

  const request = edges.find(({ node }) =>
    POST_REQUEST_HOME_ACTIVE_STATUSES.some((status) => status === node.status),
  )?.node;
  return request ? (
    <PostRequestCard
      activeConnectionId={activeConnectionId}
      onRewrite={onRewrite}
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
  loadingNext: { alignItems: 'center', padding: spacing.md },
  summaryError: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryErrorText: { fontFamily: fontFamilies.ui, ...typography.sm },
  summaryLoading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
