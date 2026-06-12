<script lang="ts">
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';
  import BottomTabBar from '$lib/components/BottomTabBar.svelte';
  import RightRail from '$lib/components/RightRail.svelte';
  import SidebarNavigation from '$lib/components/SidebarNavigation.svelte';

  let { children } = $props();

  const query = createQuery(
    graphql(`
      query TabsLayoutQuery {
        currentSession {
          id
          selectedProfile {
            id
            ...RightRail_profile
          }
        }
      }
    `),
  );

  const selectedProfile = $derived(query.data?.currentSession?.selectedProfile ?? null);

  let drawerOpen = $state(false);
  let swipeStartX = $state<number | null>(null);

  const openDrawer = () => {
    drawerOpen = true;
  };

  const closeDrawer = () => {
    drawerOpen = false;
  };

  const handlePointerDown = (event: PointerEvent) => {
    swipeStartX = event.clientX <= 24 ? event.clientX : null;
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (swipeStartX === null || event.clientX - swipeStartX < 64) {
      return;
    }

    openDrawer();
    swipeStartX = null;
  };

  const handlePointerUp = () => {
    swipeStartX = null;
  };
</script>

<svelte:window
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
/>

<div
  class="min-h-screen lg:grid lg:grid-cols-[20rem_minmax(0,600px)_minmax(290px,350px)] lg:justify-center"
>
  <div class="hidden lg:block">
    <SidebarNavigation />
  </div>

  <div class="grid min-h-screen grid-rows-[auto_1fr_auto] lg:grid-rows-[1fr]">
    <header
      class="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
    >
      <button
        class="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground"
        type="button"
        onclick={openDrawer}
        aria-expanded={drawerOpen}
        aria-controls="mobile-sidebar"
      >
        <span aria-hidden="true">☰</span>
        메뉴
      </button>
    </header>

    <main class="flex min-h-0 items-center px-6 py-8 pb-24 lg:min-h-screen lg:pb-8">
      {@render children()}
    </main>

    <BottomTabBar onMenuClick={openDrawer} />
  </div>

  <div class="border-border hidden border-l lg:block">
    <div class="sticky top-0 pt-4 pl-6">
      {#if query.loading}
        <div class="border-border bg-card grid gap-3 rounded-lg border p-4" aria-hidden="true">
          <div class="bg-surface size-8 animate-pulse rounded-full"></div>
          <div class="bg-surface h-24 animate-pulse rounded-md"></div>
          <div class="flex justify-end">
            <div class="bg-surface h-8 w-30 animate-pulse rounded-sm"></div>
          </div>
        </div>
      {:else if selectedProfile}
        <RightRail profile={selectedProfile} />
      {/if}
    </div>
  </div>

  {#if drawerOpen}
    <div class="fixed inset-0 z-40 lg:hidden" role="presentation">
      <button
        class="absolute inset-0 bg-foreground/35"
        type="button"
        aria-label="사이드바 닫기"
        onclick={closeDrawer}
      ></button>
      <div id="mobile-sidebar" class="absolute inset-y-0 left-0 max-w-[85vw]">
        <SidebarNavigation surface="drawer" onNavigate={closeDrawer} />
      </div>
    </div>
  {/if}
</div>
