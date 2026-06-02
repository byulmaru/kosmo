<script lang="ts">
  import Button from './Button.svelte';

  export type ProfileFollowState = 'ACCEPTED' | 'PENDING' | 'REJECTED';

  export type ViewerFollow = {
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
    followAction: (targetProfileId: string) => Promise<ViewerFollow>;
    unfollowAction: (targetProfileId: string) => Promise<void>;
  };

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
    loading ? '처리 중' : isPending ? '요청 중' : isFollowing ? '팔로잉' : '팔로우',
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
        await unfollowAction(targetProfileId);
        setFollow(null);
        return;
      }

      setFollow(await followAction(targetProfileId));
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
