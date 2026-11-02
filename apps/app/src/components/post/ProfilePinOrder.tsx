import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinOrder_profile$key } from './__generated__/ProfilePinOrder_profile.graphql';
import type { ProfilePinOrderMutation } from './__generated__/ProfilePinOrderMutation.graphql';
import type { ProfilePinOrderMenu } from './ProfilePinOrderContext';

const fragment = graphql`
  fragment ProfilePinOrder_profile on Profile {
    id
    instance {
      kind
    }
    pinnedPosts {
      id
    }
  }
`;

const mutation = graphql`
  mutation ProfilePinOrderMutation($postId: ID!, $beforePostId: ID) {
    reorderProfilePost(input: { postId: $postId, beforePostId: $beforePostId }) {
      changed
      profile {
        id
        ...PostList_profile_pinned
      }
    }
  }
`;

export function useProfilePinOrder(profileKey: ProfilePinOrder_profile$key | null) {
  const profile = useFragment(fragment, profileKey);
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const [commit, pending] = useMutation<ProfilePinOrderMutation>(mutation);

  return (postId: string): ProfilePinOrderMenu => {
    const posts = profile?.pinnedPosts ?? [];
    const index = posts.findIndex((post) => post?.id === postId);
    const items: ActionMenuItem[] = [];
    if (profile?.id !== selectedProfileId || profile?.instance.kind !== 'LOCAL' || index < 0) {
      return { postId, items, pending: false };
    }

    const move = (beforePostId: string | null) => {
      if (pending) {
        return;
      }
      const fail = () => {
        showToast('고정 게시글 순서를 변경하지 못했어요. 다시 시도해 주세요.', { tone: 'danger' });
      };
      commit({
        variables: { postId, beforePostId },
        onCompleted: (response) => {
          const result = response.reorderProfilePost;
          if (typeof result?.changed !== 'boolean' || result.profile?.id !== profile.id) {
            fail();
          }
        },
        onError: fail,
      });
    };

    if (index > 0) {
      items.push({
        key: 'move-profile-pin-up',
        label: '위로 이동',
        icon: ArrowUp,
        disabled: pending,
        busy: pending,
        onSelect: () => move(posts[index - 1]!.id),
      });
    }
    if (index < posts.length - 1) {
      items.push({
        key: 'move-profile-pin-down',
        label: '아래로 이동',
        icon: ArrowDown,
        disabled: pending,
        busy: pending,
        onSelect: () => move(posts[index + 2]?.id ?? null),
      });
    }
    return { postId, items, pending };
  };
}
