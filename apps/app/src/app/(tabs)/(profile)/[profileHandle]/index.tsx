import { useCurrentRouteInfo } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { ProfileRouteContainer, useProfileRoute } from '@/components/profile/ProfileRouteShell';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import type { ReactElement } from 'react';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from './__generated__/ProfilePostListPageQuery.graphql';

const ProfilePostListPageQuery = graphql`
  query ProfilePostListPageQuery($handle: String!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    profileByHandle(handle: $handle) {
      id
      viewerState {
        profileBlock {
          id
        }
      }
      ...PostList_profile @arguments(count: 20)
      ...PostList_profile_pinned
    }
  }
`;

export default function ProfilePostListPage() {
  // A Web Slot remount can leave child-local params empty when returning to a profile.
  const handle = normalizeProfileHandle(useCurrentRouteInfo()?.params.profileHandle);
  const { chrome, scrollKey } = useProfileRoute();
  const header = <>{chrome}</>;

  return (
    <View key={scrollKey} style={styles.root}>
      <RouteBoundary
        error={(retry) => (
          <PostList error header={header} onRetry={retry} reselectDestination="profile" />
        )}
        key={handle}
        loading={<PostList header={header} loading reselectDestination="profile" />}
        title="게시글 목록을 불러오지 못했어요"
      >
        <ProfilePostListPageContent handle={handle} header={header} scrollKey={scrollKey} />
      </RouteBoundary>
    </View>
  );
}

function ProfilePostListPageContent({
  handle,
  header,
  scrollKey,
}: {
  handle: string;
  header: ReactElement;
  scrollKey: string;
}) {
  const { fetchKey } = useRouteBoundary();
  const [acknowledgedProfileBlockId, setAcknowledgedProfileBlockId] = useState<string | null>(null);
  const data = useLazyLoadQuery<ProfilePostListPageQueryType>(
    ProfilePostListPageQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profileBlockId = data.profileByHandle?.viewerState?.profileBlock?.id ?? null;

  if (profileBlockId && profileBlockId !== acknowledgedProfileBlockId) {
    return (
      <ProfileRouteContainer reselectDestination="profile" scrollKey={scrollKey}>
        {header}
        <StateView
          actionLabel="게시물 보기"
          onAction={() => setAcknowledgedProfileBlockId(profileBlockId)}
          title="차단한 프로필의 게시물입니다"
        />
      </ProfileRouteContainer>
    );
  }

  return (
    <PostList
      header={header}
      ignoreBlock={profileBlockId != null && acknowledgedProfileBlockId === profileBlockId}
      identityKey={`profile:${data.profileByHandle?.id ?? handle}`}
      profile={data.profileByHandle}
      reselectDestination="profile"
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, width: '100%' },
});
