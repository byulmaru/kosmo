<script lang="ts">
  import { page } from '$app/state';
  import { graphql } from '$mearie';
  import type { BottomTabBar_profile$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';

  import Avatar from '$lib/components/Avatar.svelte';
  import { getProfileInitial } from '$lib/utils/profile';
  import { getBottomTabItems, isBottomTabActive, type BottomTabIcon } from './bottomTabBar';

  type Props = {
    selectedProfile?: BottomTabBar_profile$key | null;
  };

  let { selectedProfile = null }: Props = $props();

  const selectedProfileFragment = createFragment(
    graphql(`
      fragment BottomTabBar_profile on Profile {
        handle
        displayName
      }
    `),
    () => selectedProfile,
  );

  const TAB_ICON_PATHS = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
    search: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
    compose: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    profile: '',
  } satisfies Record<BottomTabIcon, string>;

  const tabs = $derived(
    getBottomTabItems({ selectedProfileHandle: selectedProfileFragment.data?.handle ?? null }),
  );

  const profileInitial = $derived(
    selectedProfileFragment.data
      ? getProfileInitial(
          selectedProfileFragment.data.displayName ?? undefined,
          selectedProfileFragment.data.handle,
        )
      : ' ',
  );
</script>

<nav
  class="bg-card border-border fixed inset-x-0 bottom-0 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
  aria-label="주요 메뉴"
>
  {#each tabs as tab}
    {@const active = isBottomTabActive(tab, page.url.pathname)}
    {@const iconPath = TAB_ICON_PATHS[tab.icon]}
    {#if tab.disabled}
      <span
        class="grid min-h-14 place-items-center gap-0.5 py-2 text-xs font-semibold text-text-secondary opacity-45"
        aria-disabled="true"
      >
        {#if tab.icon === 'profile'}
          <Avatar size="sm" initials={profileInitial} aria-hidden="true" />
        {:else}
          <svg
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d={iconPath} />
          </svg>
        {/if}
        <span>{tab.label}</span>
      </span>
    {:else}
      <a
        class={`grid min-h-14 place-items-center gap-0.5 py-2 text-xs font-semibold transition ${active ? 'bg-primary text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        href={tab.href}
        aria-current={active ? 'page' : undefined}
      >
        {#if tab.icon === 'profile'}
          <Avatar size="sm" initials={profileInitial} aria-hidden="true" />
        {:else}
          <svg
            class="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d={iconPath} />
          </svg>
        {/if}
        <span>{tab.label}</span>
      </a>
    {/if}
  {/each}
</nav>
