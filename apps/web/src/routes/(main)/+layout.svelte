<script lang="ts">
  import { graphql } from '$graphql';
  import { SidebarProvider, SidebarTrigger } from '$lib/components/ui/sidebar';
  import { setLanguages } from '$lib/i18n.svelte';
  import AppSidebar from './AppSidebar.svelte';

  const { children } = $props();

  const query = graphql(`
    query MainLayout_Query {
      languages

      ...MainLayout_Sidebar_query
    }
  `);

  setLanguages($query.languages);
</script>

<SidebarProvider>
  <div class="flex h-screen flex-1">
    <AppSidebar {$query} />
    <div class="flex-1">
      <!-- 풀사이즈 상단 헤더 -->
      <header class="bg-background flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <div class="bg-border h-4 w-px"></div>
        <div class="flex items-center gap-2">
          <div
            class="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
          >
            <span class="font-bold">K</span>
          </div>
          <h1 class="font-semibold">Kosmo</h1>
        </div>
      </header>

      <!-- 메인 콘텐츠 -->
      <div class="flex flex-1 flex-col gap-4 p-4">
        {@render children()}
      </div>
    </div>
  </div>
</SidebarProvider>
