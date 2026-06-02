<script lang="ts">
  import { createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';

  import FollowButtonView, { type ViewerFollow } from './FollowButtonView.svelte';

  type Props = {
    targetProfileId: string;
    viewerProfileId?: string | null;
    viewerFollow?: ViewerFollow | null;
    authenticated?: boolean;
    canMutate?: boolean;
    disabledReason?: string | null;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
    onFollowChange?: (viewerFollow: ViewerFollow | null) => void;
  };

  const followProfileMutation = graphql(`
    mutation FollowButtonFollowProfile($id: ID!) {
      followProfile(input: { id: $id }) {
        __typename
        ... on FollowProfileSuccess {
          profileFollow {
            id
            state
          }
        }
        ... on Error {
          message
        }
      }
    }
  `);

  const unfollowProfileMutation = graphql(`
    mutation FollowButtonUnfollowProfile($id: ID!) {
      unfollowProfile(input: { id: $id }) {
        __typename
        ... on UnfollowProfileSuccess {
          profileFollowId
        }
        ... on Error {
          message
        }
      }
    }
  `);

  let {
    targetProfileId,
    viewerProfileId = null,
    viewerFollow = null,
    authenticated = true,
    canMutate = true,
    disabledReason = null,
    size = 'sm',
    class: className = '',
    onFollowChange,
  }: Props = $props();

  const [followProfile] = createMutation(followProfileMutation);
  const [unfollowProfile] = createMutation(unfollowProfileMutation);

  const followAction = async (id: string) => {
    const data = await followProfile({ id });
    if (data.followProfile.__typename !== 'FollowProfileSuccess') {
      throw new Error(data.followProfile.message);
    }

    return data.followProfile.profileFollow;
  };

  const unfollowAction = async (id: string) => {
    const data = await unfollowProfile({ id });
    if (data.unfollowProfile.__typename !== 'UnfollowProfileSuccess') {
      throw new Error(data.unfollowProfile.message);
    }
  };
</script>

<FollowButtonView
  {targetProfileId}
  {viewerProfileId}
  {viewerFollow}
  {authenticated}
  {canMutate}
  {disabledReason}
  {size}
  class={className}
  {onFollowChange}
  {followAction}
  {unfollowAction}
/>
