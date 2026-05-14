<script lang="ts">
  import BottomTabBar from '$lib/components/BottomTabBar.svelte';

  let { children } = $props();
</script>

<div class="grid min-h-screen grid-rows-[1fr_auto]">
  <main class="flex min-h-screen items-center px-6 pt-[env(safe-area-inset-top)] pb-20">
    {@render children()}
  </main>
  <BottomTabBar />
</div>
