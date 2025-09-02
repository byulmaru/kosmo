<script lang="ts">
  import { usePreloadedQuery } from '@kosmo/svelte-relay';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { setLanguages } from '$lib/i18n.svelte';
  import AppSidebar from './AppSidebar.svelte';

  const { children, data } = $props();

  const query = usePreloadedQuery(data.query);

  setLanguages($query.languages);
</script>

<div class="flex min-h-screen justify-center">
  <div class="flex w-full max-w-3xl lg:max-w-5xl xl:max-w-7xl">
    <!-- Left Sidebar -->
    <AppSidebar {$query} />

    <!-- Main Content -->
    <main class="flex-1 border-x">
      {@render children()}
    </main>

    <!-- Right Section -->
    <aside class="w-90 hidden space-y-4 px-6 py-4 xl:block">
      <div class="w-78 fixed">
        <Input placeholder="검색" />
        <Button class="w-full">새 게시물</Button>
      </div>
    </aside>
  </div>
</div>
