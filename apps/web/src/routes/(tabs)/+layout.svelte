<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { graphql } from '$mearie';
  import { createQuery, getClient } from '@mearie/svelte';
  import BottomTabBar from '$lib/components/BottomTabBar.svelte';
  import RightRail from '$lib/components/RightRail.svelte';
  import SidebarNavigation from '$lib/components/SidebarNavigation.svelte';
  import { setProfileSwitcherContext } from '$lib/profileSwitcherContext';

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
            ...RightRail_profile
          }
        }
      }
    `),
  );

  const selectedProfile = $derived(query.data?.currentSession?.selectedProfile ?? null);

  // 보호 라우트 가드: 유효 세션이 없으면 루트 온보딩(/)으로 보낸다.
  // 세션 판정은 currentSession(API가 토큰을 검증해 무효·만료 시 null)으로 한다 — 쿠키 존재 아님.
  // 공개 프로필 @[handle] 서브트리(게시글 상세 +page@(tabs) 포함)는 비로그인 조회를 위해 제외한다.
  const PUBLIC_ROUTE_PREFIX = '/(tabs)/@[handle]';

  $effect(() => {
    // 로딩·에러 중에는 보류해 유효 세션·일시 오류 사용자를 잘못 튕기지 않는다.
    if (query.loading || query.error) {
      return;
    }

    const isPublic = page.route.id?.startsWith(PUBLIC_ROUTE_PREFIX) ?? false;
    if (!isPublic && !query.data?.currentSession) {
      void goto('/', { replaceState: true });
    }
  });

  const invalidateSidebarNavigationData = () => {
    client
      .extension('cache')
      .invalidate(
        { __typename: 'Query', $field: 'currentSession' },
        { __typename: 'Query', $field: 'me' },
      );
  };

  let drawerOpen = $state(false);
  let swipeStartX = $state<number | null>(null);
  let profileSwitcherOpen = $state(false);

  const openDrawer = () => {
    drawerOpen = true;
  };

  const closeDrawer = () => {
    drawerOpen = false;
  };

  // 홈 프로필 없음 온보딩 등 자식 라우트가 사이드바 프로필 스위처를 열 수 있게 한다.
  // 사이드바가 lg 미만에서는 드로어로만 보이므로 모바일에서는 드로어를 먼저 연다.
  const openProfileSwitcher = () => {
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 64rem)').matches) {
      openDrawer();
    }
    profileSwitcherOpen = true;
  };

  setProfileSwitcherContext({ openProfileSwitcher });

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
    <SidebarNavigation
      query={query.data}
      loading={query.loading}
      error={Boolean(query.error)}
      bind:switcherOpen={profileSwitcherOpen}
      onProfileStateChanged={invalidateSidebarNavigationData}
    />
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
