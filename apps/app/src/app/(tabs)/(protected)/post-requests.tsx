import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostRequestList } from '@/components/post/PostRequestList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useSession } from '@/session/SessionProvider';
import type { PostRequestListDetailPageQuery } from './__generated__/PostRequestListDetailPageQuery.graphql';

const PostRequestListDetailQuery = graphql`
  query PostRequestListDetailPageQuery($profileId: ID!, $requestId: String!) {
    postRequest(profileId: $profileId, requestId: $requestId) {
      ...PostRequestCard_request
    }
  }
`;

export default function PostRequestsScreen() {
  const { accountId, selectedProfileId } = useSession();
  const { profileId: requestedProfileId, requestId } = useLocalSearchParams<{
    profileId?: string;
    requestId?: string;
  }>();
  const profileId = requestedProfileId || selectedProfileId;
  const focusedRequestId = requestId || undefined;
  const onCompose = useShellChrome()?.openComposer;

  if (!profileId) {
    return <PostRequestListState state="profileRequired" />;
  }

  return (
    <RouteBoundary
      key={`${accountId ?? 'account'}:${profileId}:${focusedRequestId ?? ''}`}
      loading={<PostRequestListState state="loading" />}
      title="게시 요청을 불러오지 못했어요"
    >
      <PostRequestListRouteContent
        focusedRequestId={focusedRequestId}
        onCompose={onCompose}
        profileId={profileId}
      />
    </RouteBoundary>
  );
}

function PostRequestListRouteContent({
  focusedRequestId,
  onCompose,
  profileId,
}: {
  focusedRequestId?: string;
  onCompose?: () => void;
  profileId: string;
}) {
  const { fetchKey } = useRouteBoundary();

  return focusedRequestId ? (
    <PostRequestListDetailContent
      fetchKey={fetchKey}
      focusedRequestId={focusedRequestId}
      onCompose={onCompose}
      profileId={profileId}
    />
  ) : (
    <PostRequestListPageContent fetchKey={fetchKey} onCompose={onCompose} profileId={profileId} />
  );
}

function PostRequestListPageContent({
  fetchKey,
  onCompose,
  profileId,
}: {
  fetchKey: string;
  onCompose?: () => void;
  profileId: string;
}) {
  return (
    <PostRequestList
      fetchKey={fetchKey}
      key={fetchKey}
      header={<PageHeader title="게시 요청" />}
      onCompose={onCompose}
      profileId={profileId}
    />
  );
}

function PostRequestListDetailContent({
  fetchKey,
  focusedRequestId,
  onCompose,
  profileId,
}: {
  fetchKey: string;
  focusedRequestId: string;
  onCompose?: () => void;
  profileId: string;
}) {
  const data = useLazyLoadQuery<PostRequestListDetailPageQuery>(
    PostRequestListDetailQuery,
    { profileId, requestId: focusedRequestId },
    { fetchKey },
  );
  const request = data.postRequest ?? null;
  const header = (
    <>
      <PageHeader title="게시 요청" />
      {!request ? <StateView style={styles.missingRequest} title="요청을 찾을 수 없어요" /> : null}
    </>
  );

  return (
    <PostRequestList
      fetchKey={fetchKey}
      key={fetchKey}
      focusedRequest={request}
      focusedRequestId={focusedRequestId}
      header={header}
      onCompose={onCompose}
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
