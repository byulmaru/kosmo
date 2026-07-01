<script lang="ts">
  import { createFragment, createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import type { FollowButton_profile$key } from '$mearie';

  import Button from './Button.svelte';

  const followButtonProfileFragment = graphql(`
    fragment FollowButton_profile on Profile {
      id
      viewerState {
        isSelf
        follow {
          id
        }
      }
    }
  `);

  type Props = {
    profile: FollowButton_profile$key;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  };

  // followee/profile에 viewerState와 followersCount를 함께 선택해, mutation 응답만으로
  // normalized cache의 Profile.viewerState / followersCount가 갱신되게 한다(별도 refetch 불필요).
  const followProfileMutation = graphql(`
    mutation FollowButtonFollowProfile($id: ID!) {
      followProfile(input: { id: $id }) {
        profileFollow {
          id
          followee {
            followersCount
            ...FollowButton_profile
          }
        }
      }
    }
  `);

  const unfollowProfileMutation = graphql(`
    mutation FollowButtonUnfollowProfile($id: ID!) {
      unfollowProfile(input: { id: $id }) {
        profileFollowId
        profile {
          followersCount
          ...FollowButton_profile
        }
      }
    }
  `);

  let { profile, size = 'sm', class: className = '' }: Props = $props();

  const [followProfile] = createMutation(followProfileMutation);
  const [unfollowProfile] = createMutation(unfollowProfileMutation);
  const profileFragment = createFragment(followButtonProfileFragment, () => profile);

  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  const viewerState = $derived(profileFragment.data.viewerState);
  const viewerFollow = $derived(viewerState?.follow ?? null);
  const isFollowing = $derived(Boolean(viewerFollow));
  const disabled = $derived(loading);

  const toggleFollow = async () => {
    if (disabled || !viewerState || viewerState.isSelf) {
      return;
    }

    const targetProfileId = profileFragment.data.id;

    loading = true;
    errorMessage = null;

    try {
      if (isFollowing) {
        await unfollowProfile({ id: targetProfileId });
        return;
      }

      await followProfile({ id: targetProfileId });
    } catch {
      errorMessage = '팔로우 상태를 변경하지 못했습니다.';
    } finally {
      loading = false;
    }
  };
</script>

{#if viewerState && !viewerState.isSelf}
  <div class={`inline-flex flex-col items-end gap-1 ${className}`}>
    <Button
      variant={isFollowing ? 'secondary' : 'primary'}
      {size}
      {disabled}
      aria-busy={loading}
      aria-pressed={isFollowing}
      onclick={toggleFollow}
    >
      {loading ? '처리 중' : isFollowing ? '팔로잉' : '팔로우'}
    </Button>
    {#if errorMessage}
      <p class="text-text-secondary m-0 max-w-56 text-right text-xs leading-4" role="alert">
        {errorMessage}
      </p>
    {/if}
  </div>
{/if}
