<script lang="ts">
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import PostList from '$lib/components/PostList.svelte';
  import ProfileOnboarding from '$lib/components/ProfileOnboarding.svelte';
  import { getProfileSwitcherContext } from '$lib/profileSwitcherContext';
  import { getTabsLayoutSessionContext } from '$lib/tabsLayoutSessionContext';

  const query = createQuery(
    graphql(`
      query HomePageQuery {
        currentSession {
          id
        }
        me {
          id
          name
          profiles {
            id
          }
        }
        homeTimeline(first: 20) {
          ...PostList_homeTimeline
        }
      }
    `),
  );

  const profileSwitcher = getProfileSwitcherContext();
  const tabsLayoutSession = getTabsLayoutSessionContext();

  const session = $derived(query.data?.currentSession ?? null);
  const selectedProfile = $derived(tabsLayoutSession?.selectedProfile() ?? null);
  const selectedProfileVersion = $derived(tabsLayoutSession?.selectedProfileVersion() ?? 0);
  const selectedProfileLoading = $derived(tabsLayoutSession?.loading() ?? false);
  const hasProfiles = $derived((query.data?.me?.profiles?.length ?? 0) > 0);
  // 로그인 + 선택 프로필 없음일 때만 온보딩을 노출한다.
  // 비로그인·무효 세션도 인증 검증(currentSession) 로딩 중에는 (protected) 가드가 fail-open으로
  // 보류하므로 이 화면이 잠깐 렌더될 수 있다. session 존재를 함께 봐서 그사이 온보딩이 새지 않게 하고,
  // 세션이 null로 확정되면 (protected) 가드가 루트(/)로 보낸다(PROD-148).
  const showOnboarding = $derived(Boolean(session) && !selectedProfile && !selectedProfileLoading);
  let loadedHomeTimelineVersion = $state(0);
  let pendingHomeTimelineVersion = $state<number | null>(null);
  let pendingHomeTimelineSnapshot = $state<unknown>(null);

  // active profile이 바뀌면 homeTimeline은 이전 profile 기준 데이터일 수 있다.
  // invalidate로 시작된 재조회가 한 번 끝날 때까지 기존 connection을 PostList에 넘기지 않는다.
  $effect(() => {
    if (
      selectedProfileVersion !== loadedHomeTimelineVersion &&
      selectedProfileVersion !== pendingHomeTimelineVersion
    ) {
      pendingHomeTimelineVersion = selectedProfileVersion;
      pendingHomeTimelineSnapshot = query.data?.homeTimeline ?? null;
    }
  });

  $effect(() => {
    if (
      pendingHomeTimelineVersion !== null &&
      (query.error || (query.data?.homeTimeline ?? null) !== pendingHomeTimelineSnapshot)
    ) {
      loadedHomeTimelineVersion = pendingHomeTimelineVersion;
      pendingHomeTimelineVersion = null;
      pendingHomeTimelineSnapshot = null;
    }
  });

  const homeTimelineStale = $derived(pendingHomeTimelineVersion !== null);
  const homeTimeline = $derived(
    homeTimelineStale || query.error ? null : (query.data?.homeTimeline ?? null),
  );
</script>

{#if query.loading && !query.data}
  <section class="w-[min(100%,36rem)]" aria-hidden="true">
    <div class="bg-surface h-5 w-24 animate-pulse rounded-sm"></div>
    <div class="bg-surface mt-3 h-11 w-32 animate-pulse rounded-md"></div>
    <div class="bg-surface mt-3 h-6 w-72 animate-pulse rounded-sm"></div>
  </section>
  <span class="sr-only" role="status">홈을 불러오는 중입니다.</span>
{:else if showOnboarding}
  <ProfileOnboarding {hasProfiles} onAction={() => profileSwitcher?.openProfileSwitcher()} />
{:else if selectedProfile}
  <section class="grid w-[min(100%,36rem)] gap-6 self-start">
    <header>
      <p class="text-primary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
      <h1 class="text-text-primary m-0 text-5xl leading-[44px] font-bold">홈</h1>
    </header>

    <PostList
      {homeTimeline}
      loading={query.loading || homeTimelineStale}
      error={Boolean(query.error)}
      onRetry={query.refetch}
    />
  </section>
{:else}
  <section class="w-[min(100%,36rem)]">
    <p class="text-primary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
    <h1 class="text-text-primary m-0 text-5xl leading-[44px] font-bold">홈</h1>
    <span class="text-text-secondary mt-3 block max-w-90 text-base leading-6">
      피드를 확인하고 새로운 소식을 탐색합니다.
    </span>
    <p class="text-text-primary mt-3 text-base">{query.data?.me?.name}</p>
  </section>
{/if}
