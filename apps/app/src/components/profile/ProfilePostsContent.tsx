import { useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { PostList } from '@/components/post/PostList';
import { StateView } from '@/components/ui/StateView';
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
  query,
  handle,
}: {
  query: ProfilePostsContent_query$key;
  handle: string;
}) {
  const [acknowledgedProfileBlockId, setAcknowledgedProfileBlockId] = useState<string | null>(null);
  const data = useFragment<ProfilePostsContent_query$key>(ProfilePostsContentFragment, query);
  const profileBlockId = data.profileByHandle?.viewerState?.profileBlock?.id ?? null;

  if (profileBlockId && profileBlockId !== acknowledgedProfileBlockId) {
    return (
      <StateView
        actionLabel="게시물 보기"
        onAction={() => setAcknowledgedProfileBlockId(profileBlockId)}
        title="차단한 프로필의 게시물입니다"
      />
    );
  }

  return (
    <PostList
      ignoreBlock={profileBlockId != null && acknowledgedProfileBlockId === profileBlockId}
      identityKey={`profile:${data.profileByHandle?.id ?? handle}`}
      profile={data.profileByHandle}
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  );
}
