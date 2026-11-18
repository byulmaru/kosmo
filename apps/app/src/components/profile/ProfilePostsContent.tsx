import { useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { ProfileRouteContainer } from '@/components/profile/ProfileRouteShell';
import { StateView } from '@/components/ui/StateView';
import type { ReactElement } from 'react';
import type { ProfilePostsContent_query$key } from './__generated__/ProfilePostsContent_query.graphql';

const ProfilePostsContentFragment = graphql`
  fragment ProfilePostsContent_query on Query @argumentDefinitions(handle: { type: "String!" }) {
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

export function ProfilePostsContent({
  active,
  header,
  query,
  handle,
  scrollKey,
}: {
  active: boolean;
  header: ReactElement;
  query: ProfilePostsContent_query$key;
  handle: string;
  scrollKey: string;
}) {
  const [acknowledgedProfileBlockId, setAcknowledgedProfileBlockId] = useState<string | null>(null);
  const data = useFragment<ProfilePostsContent_query$key>(ProfilePostsContentFragment, query);
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
      active={active}
      header={header}
      ignoreBlock={profileBlockId != null && acknowledgedProfileBlockId === profileBlockId}
      identityKey={`profile:${data.profileByHandle?.id ?? handle}`}
      profile={data.profileByHandle}
      reselectDestination="profile"
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}
