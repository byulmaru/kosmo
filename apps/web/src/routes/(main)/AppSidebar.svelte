<script lang="ts">
  import { fragment, graphql } from '$graphql';
  import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
  } from '$lib/components/ui/sidebar/index';
  import type { MainLayout_Sidebar_query } from '$graphql';
  import ProfileDropdown from './ProfileDropdown.svelte';

  const {
    $query: _query,
    onProfileChange,
  }: { $query: MainLayout_Sidebar_query; onProfileChange: () => void } = $props();

  const query = fragment(
    _query,
    graphql(`
      fragment MainLayout_Sidebar_query on Query {
        ...MainLayout_ProfileDropdown_query
      }
    `),
  );
</script>

<Sidebar collapsible="icon">
  <SidebarHeader>
    <SidebarMenu>
      <SidebarMenuItem>
        <ProfileDropdown {$query} {onProfileChange} />
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent>
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <a href="/">
              <SidebarMenuButton tooltipContent="홈">
                <span>홈</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <a href="/explore">
              <SidebarMenuButton tooltipContent="탐색">
                <span>탐색</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <a href="/notifications">
              <SidebarMenuButton tooltipContent="알림">
                <span>알림</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <a href="/messages">
              <SidebarMenuButton tooltipContent="메시지">
                <span>메시지</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <a href="/bookmarks">
              <SidebarMenuButton tooltipContent="북마크">
                <span>북마크</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <a href="/profile">
              <SidebarMenuButton tooltipContent="프로필">
                <span>프로필</span>
              </SidebarMenuButton>
            </a>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>

  <SidebarRail />
</Sidebar>
