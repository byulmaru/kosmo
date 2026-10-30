import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import {
  commitLocalUpdate,
  ConnectionHandler,
  createOperationDescriptor,
  fetchQuery,
  getRequest,
} from 'relay-runtime';
import { InfiniteList } from '@/components/pagination/InfiniteList';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import {
  POST_REQUEST_HOME_ACTIVE_STATUSES,
  removePostRequestFromHomePage,
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
  query PostRequestListQuery($profileId: ID!, $statuses: [PostRequestStatus!], $pageToken: String) {
    postRequests(profileId: $profileId, statuses: $statuses, pageToken: $pageToken) {
      requests {
        id
        ...PostRequestList_request
      }
      nextPageToken
    }
  }
`;

type PublishedPost = Readonly<{
  authorProfileId: string | null;
  postId: string | null;
  requestNodeId: string;
}>;
type CancelledRequest = Readonly<{ requestNodeId: string }>;
type RequestKey = PostRequestList_request$key[number] & Readonly<{ id: string }>;
type RetainedPage = {
  retain: { dispose: () => void };
  subscription: { unsubscribe: () => void } | null;
};
type PageState = Readonly<{
  environment: ReturnType<typeof useRelayEnvironment>;
  isLoadingNext: boolean;
  nextPageToken: string | null;
  profileId: string;
  requests: readonly RequestKey[];
}>;

type RequestListProps = Readonly<{
  fetchKey?: string;
  focusedRequestId?: string;
  focusedRequest?: PostRequestCard_request$key | null;
  header?: ReactElement | null;
  profileId: string;
  onRewrite?: (requestId: string) => void;
}>;

function usePostRequestCardHandlers(profileId: string) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const onCancelled = useCallback(
    ({ requestNodeId }: CancelledRequest) => {
      commitLocalUpdate(environment, (store) => {
        removePostRequestFromHomePage(store, profileId, requestNodeId);
      });
    },
    [environment, profileId],
  );
  const onPublished = useCallback(
    ({ authorProfileId, postId, requestNodeId }: PublishedPost) => {
      commitLocalUpdate(environment, (store) => {
        removePostRequestFromHomePage(store, profileId, requestNodeId);

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
    [environment, profileId, selectedProfileId],
  );

  return { onCancelled, onPublished };
}

export function PostRequestList({
  fetchKey,
  focusedRequestId,
  focusedRequest,
  header,
  onRewrite,
  profileId,
}: RequestListProps) {
  const theme = useTheme();
  const environment = useRelayEnvironment();
  const { showToast } = useToast();
  const pageResources = useRef(new Set<RetainedPage>());
  const loadErrorToastCleanup = useRef<(() => void) | null>(null);
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { pageToken: null, profileId, statuses: null },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const firstPage = data.postRequests;
  const [pageState, setPageState] = useState<PageState>(() => ({
    environment,
    isLoadingNext: false,
    nextPageToken: firstPage.nextPageToken,
    profileId,
    requests: [],
  }));
  const currentPageState =
    pageState.environment === environment && pageState.profileId === profileId ? pageState : null;
  const additionalRequests = currentPageState?.requests ?? [];
  const nextPageToken = currentPageState ? currentPageState.nextPageToken : firstPage.nextPageToken;
  const isLoadingNext = currentPageState?.isLoadingNext ?? false;
  const requestKeys = useMemo(() => {
    const requestsById = new Map<string, RequestKey>();
    for (const request of [...firstPage.requests, ...additionalRequests]) {
      if (!requestsById.has(request.id)) {
        requestsById.set(request.id, request);
      }
    }
    return [...requestsById.values()];
  }, [additionalRequests, firstPage.requests]);
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    requestKeys,
  );
  const displayRequests = requests.filter((request) => request.requestId !== focusedRequestId);
  const { onCancelled, onPublished } = usePostRequestCardHandlers(profileId);

  useEffect(() => {
    setPageState({
      environment,
      isLoadingNext: false,
      nextPageToken: firstPage.nextPageToken,
      profileId,
      requests: [],
    });

    return () => {
      for (const resource of pageResources.current) {
        resource.subscription?.unsubscribe();
        resource.retain.dispose();
      }
      pageResources.current.clear();
    };
  }, [environment, firstPage.nextPageToken, profileId]);

  const loadNext = useCallback(
    (_count: number, { onComplete }: { onComplete: (error: Error | null) => void }) => {
      if (!nextPageToken) {
        onComplete(null);
        return;
      }

      const variables = { pageToken: nextPageToken, profileId, statuses: null };
      const operation = createOperationDescriptor(getRequest(PostRequestListQuery), variables);
      const retain = environment.retain(operation);
      const resource: RetainedPage = { retain, subscription: null };
      let nextPage: PostRequestListQuery['response']['postRequests'] | null = null;
      pageResources.current.add(resource);
      setPageState((previous) =>
        previous.environment === environment && previous.profileId === profileId
          ? { ...previous, isLoadingNext: true }
          : previous,
      );

      const releaseFailedPage = (error: Error) => {
        resource.subscription?.unsubscribe();
        retain.dispose();
        pageResources.current.delete(resource);
        setPageState((previous) =>
          previous.environment === environment && previous.profileId === profileId
            ? { ...previous, isLoadingNext: false }
            : previous,
        );
        onComplete(error);
      };

      resource.subscription = fetchQuery(environment, PostRequestListQuery, variables, {
        fetchPolicy: 'network-only',
      }).subscribe({
        complete: () => {
          const completedPage = nextPage;
          if (!completedPage) {
            releaseFailedPage(new Error('The post request page was empty.'));
            return;
          }

          resource.subscription?.unsubscribe();
          setPageState((previous) =>
            previous.environment === environment && previous.profileId === profileId
              ? {
                  ...previous,
                  isLoadingNext: false,
                  nextPageToken: completedPage.nextPageToken,
                  requests: [...previous.requests, ...completedPage.requests],
                }
              : previous,
          );
          onComplete(null);
        },
        error: (error) => {
          releaseFailedPage(error instanceof Error ? error : new Error(String(error)));
        },
        next: (response) => {
          nextPage = response.postRequests;
        },
      });
    },
    [environment, nextPageToken, profileId],
  );

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
      data={displayRequests}
      empty={displayRequests.length === 0 && !focusedRequestId ? empty : null}
      hasNext={nextPageToken !== null}
      isLoadingNext={isLoadingNext}
      key={`post-requests:${profileId}`}
      keyExtractor={(request) => request.id}
      loadNext={loadNext}
      onLoadErrorChange={handleLoadErrorChange}
      pageSize={20}
      header={listHeader}
      footer={
        isLoadingNext ? (
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
          onCancelled={onCancelled}
          onPublished={onPublished}
          onRewrite={onRewrite}
          request={item}
        />
      )}
      style={styles.root}
    />
  );
}

export function PostRequestListSummary({
  fetchKey,
  onRewrite,
  profileId,
}: {
  fetchKey?: string;
  onRewrite: (requestId: string) => void;
  profileId: string;
}) {
  const data = useLazyLoadQuery<PostRequestListQuery>(
    PostRequestListQuery,
    { pageToken: null, profileId, statuses: POST_REQUEST_HOME_ACTIVE_STATUSES },
    {
      fetchKey,
      fetchPolicy: fetchKey && fetchKey !== '0' ? 'network-only' : 'store-or-network',
    },
  );
  const requests = useFragment<PostRequestList_request$key>(
    PostRequestListRequestFragment,
    data.postRequests.requests,
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
      onPublished={onPublished}
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
