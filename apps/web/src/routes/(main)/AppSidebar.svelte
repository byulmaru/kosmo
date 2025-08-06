<script lang="ts">
  import { fragment, graphql } from '$graphql';
  import type { MainLayout_Sidebar_query } from '$graphql';
  import { Bell, Bookmark, Hash, Home, Mail, Sparkles, User } from '@lucide/svelte';
  import ProfileDropdown from './ProfileDropdown.svelte';
  import AppSidebarMenuButton from './AppSidebarMenuButton.svelte';

  const { $query: _query }: { $query: MainLayout_Sidebar_query } = $props();

  const query = fragment(
    _query,
    graphql(`
      fragment MainLayout_Sidebar_query on Query {
        usingProfile {
          id
          handle
        }

        ...MainLayout_ProfileDropdown_query
      }
    `),
  );
</script>

<header class="hidden h-full w-18 sm:block lg:w-60">
  <div class="fixed flex h-full w-18 flex-col lg:w-60">
    <div class="p-4 flex rounded-full text-2xl font-bold">
      <Sparkles class="size-6" />
    </div>
    <nav class="flex flex-col">
      <AppSidebarMenuButton href="/" icon={Home} label="홈" />
      <AppSidebarMenuButton href="/explore" icon={Hash} label="탐색" />
      <AppSidebarMenuButton href="/notifications" icon={Bell} label="알림" />
      <AppSidebarMenuButton href="/messages" icon={Mail} label="메시지" />
      <AppSidebarMenuButton href="/bookmarks" icon={Bookmark} label="북마크" />
      {#if $query.usingProfile}
        <AppSidebarMenuButton href={`/@${$query.usingProfile.handle}`} icon={User} label="프로필" />
      {/if}
    </nav>
    <div class="flex-1"></div>
    <div>
      <ProfileDropdown {$query} />
    </div>
  </div>
</header>
