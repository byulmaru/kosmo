<script lang="ts">
  import { ProfileRelationshipState } from '@kosmo/enum';
  import { useFragment, useMutation } from '@kosmo/svelte-relay';
  import { Button } from '$lib/components/ui/button';
  import { i18n } from '$lib/i18n.svelte';
  import { followProfileMutation, fragment, unfollowProfileMutation } from './FollowButton.graphql';
  import type { FollowButton_followProfile_Mutation } from './__generated__/FollowButton_followProfile_Mutation.graphql';
  import type { FollowButton_Profile_Fragment$key } from './__generated__/FollowButton_Profile_Fragment.graphql';
  import type { FollowButton_unfollowProfile_Mutation } from './__generated__/FollowButton_unfollowProfile_Mutation.graphql';

  const { $profile: profileRef }: { $profile: FollowButton_Profile_Fragment$key } = $props();

  const profile = useFragment(fragment, profileRef);

  const followProfile = useMutation<FollowButton_followProfile_Mutation>(followProfileMutation);

  const unfollowProfile =
    useMutation<FollowButton_unfollowProfile_Mutation>(unfollowProfileMutation);
</script>

{#if !$profile.isMe}
  {#if $profile.relationship.to === null}
    <Button
      onclick={async (e) => {
        e.preventDefault();
        await followProfile({
          variables: { input: { profileId: $profile.id } },
          optimisticResponse: {
            followProfile: {
              __typename: 'FollowProfileSuccess',
              profile: {
                id: $profile.id,
                followerCount: $profile.followerCount + 1,
                relationship: {
                  to: ProfileRelationshipState.FOLLOW,
                },
              },
            },
          },
        });
      }}
    >
      {$i18n('profile.button.follow')}
    </Button>
  {:else if $profile.relationship.to === ProfileRelationshipState.FOLLOW}
    <Button
      class="hover:bg-destructive hover:border-destructive dark:hover:bg-destructive/60 group hover:text-white"
      onclick={async (e) => {
        e.preventDefault();
        await unfollowProfile({
          variables: { input: { profileId: $profile.id } },
          optimisticResponse: {
            unfollowProfile: {
              __typename: 'UnfollowProfileSuccess',
              profile: {
                id: $profile.id,
                followerCount: $profile.followerCount - 1,
                relationship: {
                  to: null,
                },
              },
            },
          },
        });
      }}
      variant="outline"
    >
      <span class="group-hover:hidden">{$i18n('profile.button.following')}</span>
      <span class="hidden group-hover:inline">{$i18n('profile.button.unfollow')}</span>
    </Button>
  {/if}
{/if}
