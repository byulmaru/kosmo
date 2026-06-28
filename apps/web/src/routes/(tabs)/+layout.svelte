<script lang="ts">
  import { graphql } from '$mearie';
  import { createQuery, getClient } from '@mearie/svelte';
  import BottomTabBar from '$lib/components/BottomTabBar.svelte';
  import RightRail from '$lib/components/RightRail.svelte';
  import SidebarNavigation from '$lib/components/SidebarNavigation.svelte';
  import { setProfileSwitcherContext } from '$lib/profileSwitcherContext';
  import { setShellChromeContext } from '$lib/shellChromeContext';

  let { children } = $props();

  const client = getClient();
  const query = createQuery(
    graphql(`
      query TabsLayoutQuery {
        ...SidebarNavigation_query
        currentSession {
          id
          selectedProfile {
            id
            ...BottomTabBar_profile
            ...RightRail_profile
          }
        }
      }
    `),
  );
  const selectedProfile = $derived(query.data?.currentSession?.selectedProfile ?? null);

  const invalidateSidebarNavigationData = () => {
    client
      .extension('cache')
      .invalidate(
        { __typename: 'Query', $field: 'currentSession' },
        { __typename: 'Query', $field: 'me' },
        { __typename: 'Query', $field: 'homeTimeline' },
        { __typename: 'Profile', $field: 'viewerState' },
      );
  };

  let drawerOpen = $state(false);
  let swipeStartX = $state<number | null>(null);
  let profileSwitcherOpen = $state(false);

  // 보호 라우트가 콜드 세션 검증 스플래시로 셸을 덮는 동안 true가 되어, 셸 크롬을 inert 처리한다.
  // 스플래시는 (protected) 가드 안에서 렌더되고 셸은 그 부모인 여기에 있으므로, 컨텍스트로 연결한다.
  let shellInert = $state(false);
  setShellChromeContext({ setInert: (inert) => (shellInert = inert) });

  const openDrawer = () => {
    drawerOpen = true;
  };

  const closeDrawer = () => {
    drawerOpen = false;
  };

  // 홈 프로필 없음 온보딩 등 자식 라우트가 사이드바 프로필 스위처를 열 수 있게 한다.
  // 사이드바가 md 미만에서는 드로어로만 보이므로 모바일에서는 드로어를 먼저 연다.
  // md 이상에서는 (접힌) 사이드바가 보이므로 드로어 없이 스위처만 연다.
  const openProfileSwitcher = () => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 48rem)').matches) {
      openDrawer();
    }
    profileSwitcherOpen = true;
  };

  setProfileSwitcherContext({ openProfileSwitcher });

  const handlePointerDown = (event: PointerEvent) => {
    // 드로어는 md 미만(모바일)에서만 보이므로 그 폭에서만 좌측 스와이프를 받는다.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 48rem)').matches) {
      swipeStartX = null;
      return;
    }
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
  class="min-h-screen md:grid md:justify-center md:grid-cols-[5rem_minmax(0,600px)] xl:grid-cols-[20rem_minmax(0,600px)_minmax(290px,350px)]"
>
  <div class="hidden md:sticky md:top-0 md:block md:h-dvh md:self-start" inert={shellInert}>
    <SidebarNavigation
      query={query.data}
      loading={query.loading}
      error={Boolean(query.error)}
      bind:switcherOpen={profileSwitcherOpen}
      onProfileStateChanged={invalidateSidebarNavigationData}
    />
  </div>

  <div class="grid min-h-screen grid-rows-[auto_1fr_auto] md:grid-rows-[1fr]">
    <header
      class="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden"
      inert={shellInert}
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

    <main class="flex min-h-0 items-center px-6 py-8 pb-24 md:min-h-screen md:pb-8">
      {@render children()}
    </main>

    <div class="contents" inert={shellInert}>
      <BottomTabBar {selectedProfile} />
    </div>
  </div>

  <div class="border-border hidden border-l xl:block" inert={shellInert}>
    <div class="sticky top-0 h-dvh overflow-y-auto pt-4 pl-6">
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
    <div class="fixed inset-0 z-40 md:hidden" role="presentation" inert={shellInert}>
      <button
        class="absolute inset-0 bg-foreground/35"
        type="button"
        aria-label="사이드바 닫기"
        onclick={closeDrawer}
      ></button>
      <div id="mobile-sidebar" class="absolute inset-y-0 left-0 max-w-[85vw]">
        <SidebarNavigation
          query={query.data}
          loading={query.loading}
          error={Boolean(query.error)}
          surface="drawer"
          bind:switcherOpen={profileSwitcherOpen}
          onNavigate={closeDrawer}
          onProfileStateChanged={invalidateSidebarNavigationData}
        />
      </div>
    </div>
  {/if}
</div>
