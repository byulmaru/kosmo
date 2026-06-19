<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import RecentSearches from '$lib/components/RecentSearches.svelte';
  import SearchBar from '$lib/components/SearchBar.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import SearchTabs, { type SearchTab } from '$lib/components/SearchTabs.svelte';
  import {
    addRecentSearch,
    getRecentSearches,
    removeRecentSearch,
  } from '$lib/utils/recentSearches';

  // 검색어(q)와 활성 탭(tab)은 URL을 source of truth로 둔다.
  // (deep-link·공유와 향후 post(Elasticsearch)·fediverse 검색 탭 확장 대비)
  // 지금은 q를 정확 handle로만 해석하고, 사람 탭만 동작한다.
  const TAB_BY_SLUG: Record<string, SearchTab> = {
    popular: '인기',
    latest: '최신',
    media: '미디어',
    people: '사람',
  };
  const SLUG_BY_TAB: Record<SearchTab, string> = {
    인기: 'popular',
    최신: 'latest',
    미디어: 'media',
    사람: 'people',
  };

  const queryParam = $derived(page.url.searchParams.get('q') ?? '');
  // tab이 없거나 알 수 없으면 사람(people)을 기본 활성으로 둔다.
  const activeTab = $derived(TAB_BY_SLUG[page.url.searchParams.get('tab') ?? ''] ?? '사람');

  // 단계 구분(검색바 포커스 기준):
  // - input  : 검색바 포커스 = 입력 중 → 최근 검색 노출
  // - results: 포커스 해제 + q 있음 = 검색 후 → 탭 + 결과
  // - before : 그 외 = 검색 전 → 안내
  let focused = $state(false);
  const phase = $derived(focused ? 'input' : queryParam ? 'results' : 'before');

  // 입력 중 값. 포커스가 없을 때만 URL의 q와 동기화해, 타이핑/이동 중 입력이 덮어써지지 않게 한다.
  let inputValue = $state('');
  $effect(() => {
    if (!focused) {
      inputValue = queryParam;
    }
  });

  let searchBar = $state<{ blurInput: () => void }>();
  let recent = $state<string[]>([]);
  onMount(() => {
    recent = getRecentSearches();
  });

  const navigate = (q: string, tab: SearchTab) => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set('q', q.trim());
    }
    params.set('tab', SLUG_BY_TAB[tab]);
    return goto(`/search?${params.toString()}`, { keepFocus: true, noScroll: true });
  };

  // URL 갱신(비동기)이 끝난 뒤 포커스를 거둬, 단계가 한 프레임 잘못 보이지 않게 한다.
  const handleSubmit = (value: string) => {
    if (value.trim()) {
      recent = addRecentSearch(value);
    }
    void navigate(value, activeTab).then(() => searchBar?.blurInput());
  };

  const handleSelectTab = (tab: SearchTab) => {
    void navigate(queryParam, tab);
  };

  const handleSelectRecent = (term: string) => {
    inputValue = term;
    recent = addRecentSearch(term);
    void navigate(term, activeTab).then(() => searchBar?.blurInput());
  };

  const handleRemoveRecent = (term: string) => {
    recent = removeRecentSearch(term);
  };

  // 지우기 ×: 검색 후였다면 URL q도 제거해, 빈 입력과 결과 영역이 어긋나지 않게 한다.
  // (SearchBar가 입력값을 비우고 포커스를 유지하므로 입력 중 단계로 전환된다.)
  const handleClear = () => {
    if (queryParam) {
      void navigate('', activeTab);
    }
  };

  // 좌측 ←: q를 비운 뒤(URL 갱신 완료 후) 포커스를 거둬 검색 전 단계로 되돌린다.
  const handleBack = () => {
    void navigate('', activeTab).then(() => searchBar?.blurInput());
  };
</script>

<section class="flex w-[min(100%,37.5rem)] flex-col self-start">
  <SearchBar
    bind:this={searchBar}
    bind:value={inputValue}
    placeholder="검색어를 입력하세요"
    showBack={phase !== 'before'}
    onsubmit={handleSubmit}
    onback={handleBack}
    onclear={handleClear}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    class="w-full"
  />

  {#if phase === 'input'}
    <RecentSearches
      terms={recent}
      onselect={handleSelectRecent}
      onremove={handleRemoveRecent}
      class="w-full"
    />
  {:else if phase === 'results'}
    <SearchTabs active={activeTab} onselect={handleSelectTab} class="w-full" />
    {#if activeTab === '사람'}
      <!-- TODO(PROD-154): SearchResults에 profileByHandle createQuery를 연결해
           loading/error/결과 목록(ProfileListItem)·결과 없음을 query 상태로 렌더한다. -->
      <SearchResults query={queryParam} class="w-full" />
    {:else}
      <div class="px-4 py-12 text-center">
        <p class="text-text-primary text-base font-semibold">준비 중인 검색이에요</p>
        <p class="text-text-secondary mt-1 text-sm">{activeTab} 검색은 곧 제공될 예정이에요.</p>
      </div>
    {/if}
  {:else}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">프로필을 검색해보세요</p>
      <p class="text-text-secondary mt-1 text-sm">
        handle을 입력하면 일치하는 프로필을 찾아드려요.
      </p>
    </div>
  {/if}
</section>
