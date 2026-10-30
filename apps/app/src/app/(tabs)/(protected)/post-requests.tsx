import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostRequestComposer } from '@/components/post/PostRequestComposer';
import { PostRequestList } from '@/components/post/PostRequestList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useSession } from '@/session/SessionProvider';
import type { PostRequestListDetailPageQuery } from './__generated__/PostRequestListDetailPageQuery.graphql';

const PostRequestListDetailQuery = graphql`
  query PostRequestListDetailPageQuery($profileId: ID!, $requestId: String!) {
    postRequest(profileId: $profileId, requestId: $requestId) {
      status
      ...PostRequestCard_request
      ...PostRequestComposer_request
    }
  }
`;

export default function PostRequestsScreen() {
  const router = useRouter();
  const { accountId, selectedProfileId } = useSession();
  const {
    edit,
    profileId: requestedProfileId,
    requestId,
  } = useLocalSearchParams<{
    edit?: string;
    profileId?: string;
    requestId?: string;
  }>();
  const profileId = requestedProfileId || selectedProfileId;
  const focusedRequestId = requestId || undefined;
  const editing = edit === '1' && Boolean(focusedRequestId);
  const onRewrite = useCallback(
    (nextRequestId: string) =>
      router.setParams({ edit: '1', profileId: profileId ?? undefined, requestId: nextRequestId }),
    [profileId, router],
  );
  const onBack = useCallback(
    () => router.setParams({ edit: undefined, requestId: undefined }),
    [router],
  );

  if (!profileId) {
    return <PostRequestListState state="profileRequired" />;
  }

  return (
    <RouteBoundary
      key={`${accountId ?? 'account'}:${profileId}:${focusedRequestId ?? ''}:${editing ? 'edit' : 'view'}`}
      loading={<PostRequestListState state="loading" />}
      title="게시 요청을 불러오지 못했어요"
    >
      <PostRequestListRouteContent
        editing={editing}
        focusedRequestId={focusedRequestId}
        onBack={onBack}
        onRewrite={onRewrite}
        profileId={profileId}
      />
    </RouteBoundary>
  );
}

function PostRequestListRouteContent({
  editing,
  focusedRequestId,
  onBack,
  onRewrite,
  profileId,
}: {
  editing: boolean;
  focusedRequestId?: string;
  onBack: () => void;
  onRewrite: (requestId: string) => void;
  profileId: string;
}) {
  const { fetchKey } = useRouteBoundary();

  return focusedRequestId ? (
    <PostRequestListDetailContent
      editing={editing}
      fetchKey={fetchKey}
      focusedRequestId={focusedRequestId}
      onBack={onBack}
      onRewrite={onRewrite}
      profileId={profileId}
    />
  ) : (
    <PostRequestListPageContent fetchKey={fetchKey} onRewrite={onRewrite} profileId={profileId} />
  );
}

function PostRequestListPageContent({
  fetchKey,
  onRewrite,
  profileId,
}: {
  fetchKey: string;
  onRewrite: (requestId: string) => void;
  profileId: string;
}) {
  return (
    <PostRequestList
      fetchKey={fetchKey}
      key={fetchKey}
      header={<PageHeader title="게시 요청" />}
      onRewrite={onRewrite}
      profileId={profileId}
    />
  );
}

function PostRequestListDetailContent({
  editing,
  fetchKey,
  focusedRequestId,
  onBack,
  onRewrite,
  profileId,
}: {
  editing: boolean;
  fetchKey: string;
  focusedRequestId: string;
  onBack: () => void;
  onRewrite: (requestId: string) => void;
  profileId: string;
}) {
  const data = useLazyLoadQuery<PostRequestListDetailPageQuery>(
    PostRequestListDetailQuery,
    { profileId, requestId: focusedRequestId },
    { fetchKey },
  );
  const request = data.postRequest ?? null;
  const editingRequest =
    editing && (request?.status === 'FAILED' || request?.status === 'CANCELLED');
  const header = (
    <>
      <PageHeader title="게시 요청" />
      {editingRequest && request ? (
        <PostRequestComposer onBack={onBack} request={request} />
      ) : !request ? (
        <StateView style={styles.missingRequest} title="요청을 찾을 수 없어요" />
      ) : null}
    </>
  );

  return (
    <PostRequestList
      fetchKey={fetchKey}
      key={fetchKey}
      focusedRequest={editingRequest ? null : request}
      focusedRequestId={focusedRequestId}
      header={header}
      onRewrite={onRewrite}
      profileId={profileId}
    />
  );
}

function PostRequestListState({ state }: { state: 'loading' | 'profileRequired' }) {
  return (
    <View style={styles.root}>
      <PageHeader title="게시 요청" />
      {state === 'loading' ? (
        <StateView loading title="게시 요청을 불러오는 중입니다." />
      ) : (
        <StateView title="프로필을 선택해주세요" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  missingRequest: { paddingHorizontal: 24, paddingVertical: 48 },
});
