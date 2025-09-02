<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { Bell, Bookmark, Hash, Home, Mail, Sparkles, User } from '@lucide/svelte';
  import { fragment } from './AppSidebar.graphql';
  import AppSidebarMenuButton from './AppSidebarMenuButton.svelte';
  import ProfileDropdown from './ProfileDropdown.svelte';
  import type { AppSidebar_MainLayout_Fragment$key } from './__generated__/AppSidebar_MainLayout_Fragment.graphql';

  type Props = {
    $query: AppSidebar_MainLayout_Fragment$key;
  };

  const { $query: fragmentRef }: Props = $props();
  const query = useFragment(fragment, fragmentRef);
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
