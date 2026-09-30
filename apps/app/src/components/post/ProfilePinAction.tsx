import { Pin } from 'lucide-react-native';
import { useCallback } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { ProfilePinActionPinProfilePostMutation } from './__generated__/ProfilePinActionPinProfilePostMutation.graphql';
import type { ProfilePinActionUnpinProfilePostMutation } from './__generated__/ProfilePinActionUnpinProfilePostMutation.graphql';

export type ProfilePinContext = Readonly<{
  firstPinnedPostId: string | null;
  profileIsLocal: boolean;
  onUnpinned?: () => void;
}>;

const profilePinFragment = graphql`
  fragment ProfilePinAction_post on Post {
    id
    state
    visibility
    content {
      id
    }
    repostSource {
      id
    }
    profile {
      id
      instance {
        kind
      }
    }
  }
`;

const pinMutation = graphql`
  mutation ProfilePinActionPinProfilePostMutation($postId: ID!) {
    pinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const unpinMutation = graphql`
  mutation ProfilePinActionUnpinProfilePostMutation($postId: ID!) {
    unpinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const failureMessage = '고정 상태를 변경하지 못했어요. 다시 시도해 주세요.';

type ProfilePinMutationPayload =
  | ProfilePinActionPinProfilePostMutation['response']['pinProfilePost']
  | ProfilePinActionUnpinProfilePostMutation['response']['unpinProfilePost'];

function isDurableProfilePinResult(
  result: ProfilePinMutationPayload | null | undefined,
  profileId: string,
) {
  return typeof result?.changed === 'boolean' && result.profile?.id === profileId;
}

export function useProfilePinAction(
  postKey: ProfilePinAction_post$key,
  context: ProfilePinContext | null | undefined,
): Readonly<{ item?: ActionMenuItem; pending: boolean }> {
  const post = useFragment(profilePinFragment, postKey);
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const [commitPin, isPinning] = useMutation<ProfilePinActionPinProfilePostMutation>(pinMutation);
  const [commitUnpin, isUnpinning] =
    useMutation<ProfilePinActionUnpinProfilePostMutation>(unpinMutation);
  const pending = isPinning || isUnpinning;

  const pinned = context?.firstPinnedPostId === post.id;
  const eligible = Boolean(
    context?.profileIsLocal &&
    selectedProfileId === post.profile.id &&
    post.profile.instance.kind === 'LOCAL' &&
    post.state === 'ACTIVE' &&
    post.content &&
    ['PUBLIC', 'UNLISTED', 'FOLLOWERS'].includes(post.visibility),
  );
  const blockedByExistingPin = Boolean(context?.firstPinnedPostId && !pinned);
  const handleCompleted = useCallback(
    (result: ProfilePinMutationPayload | null | undefined) => {
      if (!isDurableProfilePinResult(result, post.profile.id)) {
        showToast(failureMessage, { tone: 'danger' });
      }
    },
    [post.profile.id, showToast],
  );

  const onSelect = useCallback(() => {
    if (!eligible || pending || blockedByExistingPin) {
      return;
    }

    const onError = () => {
      showToast(failureMessage, { tone: 'danger' });
    };
    if (pinned) {
      commitUnpin({
        onCompleted: (response) => {
          handleCompleted(response.unpinProfilePost);
          if (isDurableProfilePinResult(response.unpinProfilePost, post.profile.id)) {
            context?.onUnpinned?.();
          }
        },
        onError,
        variables: { postId: post.id },
      });
      return;
    }
    commitPin({
      onCompleted: (response) => handleCompleted(response.pinProfilePost),
      onError,
      variables: { postId: post.id },
    });
  }, [
    blockedByExistingPin,
    context,
    commitPin,
    commitUnpin,
    eligible,
    handleCompleted,
    pending,
    pinned,
    post.id,
    post.profile.id,
    showToast,
  ]);

  if (!eligible || blockedByExistingPin) {
    return { pending };
  }

  return {
    item: {
      icon: Pin,
      key: pinned ? 'unpin-profile-post' : 'pin-profile-post',
      label: pinned ? '프로필 고정 해제' : '프로필에 고정',
      onSelect,
    },
    pending,
  };
}
