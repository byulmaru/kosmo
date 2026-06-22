<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';
  import type { HTMLAttributes } from 'svelte/elements';

  import type { ProfileListItem_profile$key } from '$mearie';

  import Avatar from './Avatar.svelte';
  import FollowButton from './FollowButton.svelte';

  type ProfileListItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'class'> & {
    profile: ProfileListItem_profile$key;
    href?: string | null;
    viewerProfileId?: string | null;
    width?: 'compact' | 'wide';
    class?: string | null;
  };

  let {
    profile,
    href = null,
    viewerProfileId = null,
    width = 'compact',
    class: className = null,
    ...rest
  }: ProfileListItemProps = $props();

  const profileListItem = tv({
    base: 'border-border bg-card flex min-h-16 items-center gap-3 border-b px-4',
    variants: {
      width: {
        compact: 'w-[358px]',
        wide: 'w-[390px]',
      },
    },
    defaultVariants: {
      width: 'compact',
    },
  });

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
</script>

<div {...rest} class={profileListItem({ width, class: className })}>
  {#if href}
    <a
      {href}
      class="group focus-visible:outline-more flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Avatar
        size="md"
        initials={getProfileInitial(fragment.data.displayName, fragment.data.handle)}
      />
      <div class="min-w-0 flex-1">
        <p class="text-text-primary group-hover:underline m-0 truncate text-sm font-bold">
          {fragment.data.displayName}
        </p>
        <p class="text-text-secondary m-0 truncate text-xs">@{fragment.data.handle}</p>
        {#if fragment.data.bio}
          <p class="text-text-primary m-0 mt-1 truncate text-xs">{fragment.data.bio}</p>
        {/if}
      </div>
    </a>
  {:else}
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <Avatar
        size="md"
        initials={getProfileInitial(fragment.data.displayName, fragment.data.handle)}
      />
      <div class="min-w-0 flex-1">
        <p class="text-text-primary m-0 truncate text-sm font-bold">{fragment.data.displayName}</p>
        <p class="text-text-secondary m-0 truncate text-xs">@{fragment.data.handle}</p>
        {#if fragment.data.bio}
          <p class="text-text-primary m-0 mt-1 truncate text-xs">{fragment.data.bio}</p>
        {/if}
      </div>
    </div>
  {/if}
  {#if viewerProfileId}
    <FollowButton profile={fragment.data} {viewerProfileId} class="shrink-0" />
  {/if}
</div>
