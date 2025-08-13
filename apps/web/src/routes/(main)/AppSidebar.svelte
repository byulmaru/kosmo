<script lang="ts">
  import { Bell, Bookmark, Hash, Home, Mail, Sparkles, User } from '@lucide/svelte';
  import { fragment, graphql } from '$graphql';
  import AppSidebarMenuButton from './AppSidebarMenuButton.svelte';
  import ProfileDropdown from './ProfileDropdown.svelte';
  import type { MainLayout_Sidebar_query } from '$graphql';

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

<header class="w-18 hidden h-full sm:block lg:w-60">
  <div class="w-18 fixed flex h-full flex-col lg:w-60">
    <div class="flex rounded-full p-4 text-2xl font-bold">
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
