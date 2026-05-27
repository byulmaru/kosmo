<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type UserRowState = 'follow' | 'following';

  type UserRowProps = HTMLAttributes<HTMLDivElement> & {
    state?: UserRowState;
    name?: string;
    handle?: string;
    meta?: string;
    bio?: string;
    width?: 'compact' | 'wide';
  };

  let {
    state = 'follow',
    name = '사용자 이름',
    handle = '@handle@kos.mo',
    meta = '',
    bio = '',
    width = 'compact',
    class: className = '',
    ...rest
  }: UserRowProps = $props();

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
      <p class="text-foreground m-0 truncate text-sm font-bold">{name}</p>
      {#if meta}
        <span class="text-muted-foreground truncate text-xs">{meta}</span>
      {/if}
    </div>
    <p class="text-muted-foreground m-0 truncate text-xs">{handle}</p>
    {#if bio}
      <p class="text-foreground m-0 mt-1 truncate text-xs">{bio}</p>
    {/if}
  </div>
  <button
    class={`h-[27px] min-w-[58px] rounded-full px-3 text-xs font-bold ${following ? 'bg-secondary text-foreground' : 'bg-foreground text-background'}`}
    type="button"
  >
    {buttonLabel}
  </button>
</div>
