<script lang="ts">
  import { page } from '$app/state';
  import { BellIcon, HomeIcon, SearchIcon, SquarePenIcon, UserIcon } from '@lucide/svelte';
  import type { IconProps } from '@lucide/svelte';
  import type { Component } from 'svelte';

  import Avatar from '$lib/components/Avatar.svelte';
  import { getProfileInitial } from '$lib/utils/profile';
  import { getBottomTabItems, isBottomTabActive, type BottomTabIcon } from './bottomTabBar';

  type Props = {
    selectedProfile?: {
      handle: string;
      displayName?: string | null;
    } | null;
  };

  let { selectedProfile = null }: Props = $props();

  const TAB_ICONS = {
    home: HomeIcon,
    search: SearchIcon,
    compose: SquarePenIcon,
    notifications: BellIcon,
    profile: UserIcon,
  } satisfies Record<BottomTabIcon, Component<IconProps>>;

  const tabs = $derived(
    getBottomTabItems({ selectedProfileHandle: selectedProfile?.handle ?? null }),
  );
</script>

<nav
  class="bg-card border-border fixed inset-x-0 bottom-0 grid min-h-[77px] grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
  aria-label="주요 메뉴"
>
  {#each tabs as tab}
    {@const active = isBottomTabActive(tab, page.url.pathname)}
    {@const Icon = TAB_ICONS[tab.icon]}
    {#if tab.disabled}
      <span
        class="relative grid min-h-18 place-items-center px-2 py-2 text-text-secondary opacity-45"
        aria-disabled="true"
        aria-label={tab.label}
      >
        <span class="grid size-10 place-items-center rounded-full bg-surface">
          <UserIcon class="size-5" aria-hidden="true" />
        </span>
        <span class="sr-only">{tab.label}</span>
      </span>
    {:else}
      <a
        class={`relative grid min-h-18 place-items-center px-2 py-2 transition ${active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        href={tab.href}
        aria-label={tab.label}
        aria-current={active ? 'page' : undefined}
      >
        {#if active}
          <span class="bg-text-primary absolute top-0 h-px w-full" aria-hidden="true"></span>
        {/if}
        {#if tab.icon === 'profile'}
          <Avatar
            size="md"
            initials={selectedProfile
              ? getProfileInitial(selectedProfile.displayName ?? undefined, selectedProfile.handle)
              : ''}
            aria-hidden="true"
          />
        {:else}
          <Icon class="size-8" aria-hidden="true" />
        {/if}
        <span class="sr-only">{tab.label}</span>
      </a>
    {/if}
  {/each}
</nav>
