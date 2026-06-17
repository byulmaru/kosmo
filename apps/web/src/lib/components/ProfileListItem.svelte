<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import { getProfileInitial } from '$lib/utils/profile';
  import type { HTMLAttributes } from 'svelte/elements';

  import type { ProfileListItem_profile$key } from '$mearie';

  import Avatar from './Avatar.svelte';
  import FollowButton from './FollowButton.svelte';

  type ProfileListItemProps = HTMLAttributes<HTMLDivElement> & {
    profile: ProfileListItem_profile$key;
    viewerProfileId?: string | null;
    width?: 'compact' | 'wide';
  };

  let {
    profile,
    viewerProfileId = null,
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
        ...FollowButton_profile
      }
    `),
    () => profile,
  );

  const widthClass = $derived(width === 'wide' ? 'w-[390px]' : 'w-[358px]');
  const showFollowButton = $derived(
    Boolean(viewerProfileId && viewerProfileId !== fragment.data.id),
  );
</script>

<div
  {...rest}
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
  {#if showFollowButton}
    <FollowButton profile={fragment.data} {viewerProfileId} class="shrink-0" />
  {/if}
</div>
