<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import { getProfileInitial } from '$lib/utils/profile';
  import type { HTMLAttributes } from 'svelte/elements';

  import type { ProfileListItem_profile$key } from '$mearie';

  import Avatar from './Avatar.svelte';

  type ProfileListItemState = 'follow' | 'following';

  type ProfileListItemProps = HTMLAttributes<HTMLDivElement> & {
    profile: ProfileListItem_profile$key;
    state?: ProfileListItemState;
    width?: 'compact' | 'wide';
  };

  let {
    profile,
    state = 'follow',
    width = 'compact',
    class: className = '',
    ...rest
  }: ProfileListItemProps = $props();

  const fragment = createFragment(
    graphql(`
      fragment ProfileListItem_profile on Profile {
        id
        displayName
        handle
        bio
      }
    `),
    () => profile,
  );

  const following = $derived(state === 'following');
  const buttonLabel = $derived(following ? '팔로잉' : '팔로우');
  const widthClass = $derived(width === 'wide' ? 'w-[390px]' : 'w-[358px]');
</script>

<div
  {...rest}
  data-state={state}
  class={`border-border bg-card flex min-h-16 items-center gap-3 border-b px-4 ${widthClass} ${className}`}
>
  <Avatar size="md" initials={getProfileInitial(fragment.data.displayName, fragment.data.handle)} />
  <div class="min-w-0 flex-1">
    <p class="text-text-primary m-0 truncate text-sm font-bold">{fragment.data.displayName}</p>
    <p class="text-text-secondary m-0 truncate text-xs">@{fragment.data.handle}</p>
    {#if fragment.data.bio}
      <p class="text-text-primary m-0 mt-1 truncate text-xs">{fragment.data.bio}</p>
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
