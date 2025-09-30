<script lang="ts">
  import { useFragment } from '@kosmo/svelte-relay';
  import { HouseIcon, PencilLineIcon, Sparkles, User } from '@lucide/svelte';
  // import { BellIcon, BookmarkIcon, HashIcon, MailIcon } from '@lucide/svelte';
  import Button from '$lib/components/ui/button/button.svelte';
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

<!-- PC Header -->
<header class="w-18 hidden h-full sm:block lg:w-60">
  <div class="w-18 fixed flex h-full flex-col border-r lg:w-60">
    <div class="flex justify-center rounded-full p-4 text-2xl font-bold lg:justify-start">
      <Sparkles class="size-6" />
    </div>
    <nav class="flex flex-col">
      <AppSidebarMenuButton href="/" icon={HouseIcon} label="홈" />
      <!-- <AppSidebarMenuButton href="/explore" icon={HashIcon} label="탐색" /> -->
      {#if $query.usingProfile}
        <!-- <AppSidebarMenuButton href="/notifications" icon={BellIcon} label="알림" />
        <AppSidebarMenuButton href="/messages" icon={MailIcon} label="메시지" />
        <AppSidebarMenuButton href="/bookmarks" icon={BookmarkIcon} label="북마크" /> -->
        <AppSidebarMenuButton href={`/@${$query.usingProfile.handle}`} icon={User} label="프로필" />
        <Button class="mx-4 mt-8" size="lg"
          ><PencilLineIcon /><span class="hidden lg:inline">새 글 작성</span></Button
        >
      {/if}
    </nav>
    <div class="flex-1"></div>
    <div>
      <ProfileDropdown {$query} />
    </div>
  </div>
</header>
