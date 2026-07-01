<script lang="ts">
  import { createFragment, createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import type { FollowButton_profile$key } from '$mearie';

  import Button from './Button.svelte';

  const followButtonProfileFragment = graphql(`
    fragment FollowButton_profile on Profile {
      id
      viewerState {
        authenticated
        hasSelectedProfile
        isSelf
        canMutate
        follow {
          id
          state
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
          state
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
  const viewerFollow = $derived(viewerState.follow);
  const isFollowing = $derived(viewerFollow?.state === 'ACCEPTED');
  // TODO: 승인 플로우가 추가되면 PENDING/REJECTED 전이를 실제 mutation 결과로 검증한다.
  const isPending = $derived(viewerFollow?.state === 'PENDING');
  const unavailableReason = $derived(
    !viewerState.authenticated
      ? '로그인 후 팔로우할 수 있습니다.'
      : !viewerState.hasSelectedProfile
        ? '프로필을 선택한 뒤 팔로우할 수 있습니다.'
        : !viewerState.canMutate
          ? '이 프로필을 팔로우할 권한이 없습니다.'
          : null,
  );
  const disabled = $derived(loading || Boolean(unavailableReason));
  const message = $derived(errorMessage ?? unavailableReason);

  const toggleFollow = async () => {
    if (disabled) {
      return;
    }

    const targetProfileId = profileFragment.data.id;

    loading = true;
    errorMessage = null;

    try {
      if (isFollowing || isPending) {
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

{#if !viewerState.isSelf}
  <!-- 안내문이 버튼보다 넓어도 버튼은 우측 끝에 붙도록 items-end로 정렬한다. -->
  <div class={`inline-flex flex-col items-end gap-1 ${className}`}>
    <Button
      variant={isFollowing || isPending ? 'secondary' : 'primary'}
      {size}
      {disabled}
      aria-busy={loading}
      aria-pressed={isFollowing}
      onclick={toggleFollow}
    >
      {loading ? '처리 중' : isPending ? '요청 중' : isFollowing ? '팔로잉' : '팔로우'}
    </Button>
    {#if message}
      <p
        class="text-text-secondary m-0 max-w-56 text-right text-xs leading-4"
        role={errorMessage ? 'alert' : undefined}
      >
        {message}
      </p>
    {/if}
  </div>
{/if}
