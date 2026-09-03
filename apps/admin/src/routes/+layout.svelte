<script lang="ts">
  import '../app.css';

  import AppSidebar from '$lib/components/app-sidebar.svelte';
  import { Separator } from '$lib/components/ui/separator';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<Sidebar.Provider>
  <AppSidebar viewer={data.viewer} />
  <Sidebar.Inset>
    <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <Sidebar.Trigger />
      <Separator orientation="vertical" class="mr-2 h-4!" />
      <span class="text-sm font-medium">Kosmo Admin Console</span>
    </header>
    <div class="flex flex-1 flex-col p-4 md:p-6">{@render children()}</div>
  </Sidebar.Inset>
</Sidebar.Provider>
