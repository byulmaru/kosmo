<script lang="ts">
  import { createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';

  import Button from './Button.svelte';

  type ProfileFollowState = 'ACCEPTED' | 'PENDING' | 'REJECTED';

  type ViewerFollow = {
    id: string;
    state: ProfileFollowState;
  };

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
    followAction?: (targetProfileId: string) => Promise<ViewerFollow>;
    unfollowAction?: (targetProfileId: string) => Promise<void>;
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
    followAction,
    unfollowAction,
  }: Props = $props();

  const [followProfile] = createMutation(followProfileMutation);
  const [unfollowProfile] = createMutation(unfollowProfileMutation);

  let currentFollow = $state<ViewerFollow | null>(null);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    currentFollow = viewerFollow;
  });

  const isSelf = $derived(Boolean(viewerProfileId && viewerProfileId === targetProfileId));
  const isFollowing = $derived(currentFollow?.state === 'ACCEPTED');
  const isPending = $derived(currentFollow?.state === 'PENDING');
  const unavailableReason = $derived(
    disabledReason ??
      (!authenticated
        ? '로그인 후 팔로우할 수 있습니다.'
        : !viewerProfileId
          ? '프로필을 선택한 뒤 팔로우할 수 있습니다.'
          : isSelf
            ? '내 프로필은 팔로우할 수 없습니다.'
            : !canMutate
              ? '이 프로필을 팔로우할 권한이 없습니다.'
              : null),
  );
  const disabled = $derived(loading || Boolean(unavailableReason) || isPending);
  const label = $derived(
    loading ? '처리 중' : isSelf ? '나' : isPending ? '요청 중' : isFollowing ? '팔로잉' : '팔로우',
  );
  const buttonVariant = $derived(isFollowing || isPending || isSelf ? 'secondary' : 'primary');
  const statusMessage = $derived(errorMessage ?? unavailableReason);

  const setFollow = (nextFollow: ViewerFollow | null) => {
    currentFollow = nextFollow;
    onFollowChange?.(nextFollow);
  };

  const toggleFollow = async () => {
    if (disabled) {
      return;
    }

    loading = true;
    errorMessage = null;

    try {
      if (isFollowing) {
        if (unfollowAction) {
          await unfollowAction(targetProfileId);
          setFollow(null);
          return;
        }

        const data = await unfollowProfile({ id: targetProfileId });
        if (data.unfollowProfile.__typename !== 'UnfollowProfileSuccess') {
          errorMessage = data.unfollowProfile.message;
          return;
        }

        setFollow(null);
        return;
      }

      if (followAction) {
        setFollow(await followAction(targetProfileId));
        return;
      }

      const data = await followProfile({ id: targetProfileId });
      if (data.followProfile.__typename !== 'FollowProfileSuccess') {
        errorMessage = data.followProfile.message;
        return;
      }

      setFollow(data.followProfile.profileFollow);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : '팔로우 상태를 변경하지 못했습니다.';
    } finally {
      loading = false;
    }
  };
</script>

<div class={`inline-flex flex-col items-start gap-1 ${className}`}>
  <Button
    variant={buttonVariant}
    {size}
    {disabled}
    aria-busy={loading}
    aria-pressed={isFollowing}
    onclick={toggleFollow}
  >
    {label}
  </Button>
  {#if statusMessage}
    <p
      class="text-text-secondary m-0 max-w-56 text-xs leading-4"
      role={errorMessage ? 'status' : undefined}
    >
      {statusMessage}
    </p>
  {/if}
</div>
