<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import SearchBar from '$lib/components/SearchBar.svelte';
  import SearchResults from '$lib/components/SearchResults.svelte';
  import SearchTabs, { type SearchTab } from '$lib/components/SearchTabs.svelte';

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

  // 입력 중 값. URL의 q를 초기값으로 두고, 뒤로가기 등으로 q가 바뀌면 동기화한다.
  let inputValue = $state('');
  $effect(() => {
    inputValue = queryParam;
  });

  const navigate = (q: string, tab: SearchTab) => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set('q', q.trim());
    }
    params.set('tab', SLUG_BY_TAB[tab]);
    void goto(`/search?${params.toString()}`, { keepFocus: true, noScroll: true });
  };

  const handleSubmit = (value: string) => {
    navigate(value, activeTab);
  };

  const handleSelectTab = (tab: SearchTab) => {
    navigate(queryParam, tab);
  };
</script>

<section class="flex w-[min(100%,37.5rem)] flex-col self-start">
  <SearchBar
    bind:value={inputValue}
    placeholder="검색어를 입력하세요"
    onsubmit={handleSubmit}
    class="w-full"
  />
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
</section>
