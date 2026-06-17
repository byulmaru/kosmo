<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type ProfileListItemState = 'follow' | 'following';

  type ProfileListItemProps = HTMLAttributes<HTMLDivElement> & {
    state?: ProfileListItemState;
    name?: string;
    handle?: string;
    tags?: string;
    bio?: string;
    width?: 'compact' | 'wide';
  };

  let {
    state = 'follow',
    name = '사용자 이름',
    handle = '@handle@kos.mo',
    tags = '',
    bio = '',
    width = 'compact',
    class: className = '',
    ...rest
  }: ProfileListItemProps = $props();

  const following = $derived(state === 'following');
  const buttonLabel = $derived(following ? '팔로잉' : '팔로우');
  const widthClass = $derived(width === 'wide' ? 'w-[390px]' : 'w-[358px]');
</script>

<div
  {...rest}
  data-state={state}
  class={`border-border bg-card flex min-h-16 items-center gap-3 border-b px-4 ${widthClass} ${className}`}
>
  <Avatar size="md" initials="K" />
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-1">
      <p class="text-text-primary m-0 truncate text-sm font-bold">{name}</p>
      {#if tags}
        <span class="text-text-secondary truncate text-xs">{tags}</span>
      {/if}
    </div>
    <p class="text-text-secondary m-0 truncate text-xs">{handle}</p>
    {#if bio}
      <p class="text-text-primary m-0 mt-1 truncate text-xs">{bio}</p>
    {/if}
  </div>
  <!-- 정적 팔로우 버튼 placeholder. 실제 FollowButton 연결은 PROD-156에서 처리한다. -->
  <button
    class={`h-[27px] min-w-[58px] rounded-full px-3 text-xs font-bold ${following ? 'bg-surface text-text-primary' : 'bg-text-primary text-bg'}`}
    type="button"
  >
    {buttonLabel}
  </button>
</div>
