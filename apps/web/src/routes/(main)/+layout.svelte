<script lang="ts">
  import { usePreloadedQuery } from '@kosmo/svelte-relay';
  import { Input } from '$lib/components/ui/input';
  import { setLanguages } from '$lib/i18n.svelte';
  import AppSidebar from './AppSidebar.svelte';
  import WritePost from './WritePost.svelte';

  const { children, data } = $props();

  const query = usePreloadedQuery(data.query);

  setLanguages($query.languages);
</script>

<div class="flex min-h-screen justify-center">
  <div class="flex w-full max-w-3xl lg:max-w-7xl">
    <!-- Left Sidebar -->
    <AppSidebar {$query} />

    <!-- Main Content -->
    <main class="flex-1">
      {@render children()}
    </main>

    <!-- Right Section -->
    <aside class="w-90 hidden space-y-4 lg:block">
      <div class="w-90 fixed min-h-full space-y-4 border-l p-4">
        <Input placeholder="검색" />

        <div class="space-y-3">
          {#if $query.usingProfile}
            <WritePost $profile={$query.usingProfile} />
          {/if}
        </div>
      </div>
    </aside>
  </div>
</div>
