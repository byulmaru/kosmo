<script lang="ts">
  import { parseSearchTab, SearchTab } from '@kosmo/core/search';
  import { onMount, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';
  import FollowButton from '$lib/components/FollowButton.svelte';
  import RecentSearches from '$lib/components/Search/RecentSearches.svelte';
  import SearchBar from '$lib/components/Search/SearchBar.svelte';
  import SearchResults from '$lib/components/Search/SearchResults.svelte';
  import SearchTabs, { SEARCH_TAB_LABELS } from '$lib/components/Search/SearchTabs.svelte';
  import {
    addRecentSearch,
    getRecentSearches,
    removeRecentSearch,
  } from '$lib/utils/recentSearches';

  // 검색어(q)와 활성 탭(tab)은 URL을 source of truth로 둔다.
  // (deep-link·공유와 향후 post(Elasticsearch)·fediverse 검색 탭 확장 대비)
  // 지금은 q를 정확 handle로만 해석하고, 사람 탭만 동작한다.
  // SearchTab 정의(slug)는 @kosmo/core/search에 두고, 한글 라벨은 SEARCH_TAB_LABELS로 표시한다.
  const queryParam = $derived(page.url.searchParams.get('q') ?? '');
  const trimmedQuery = $derived(queryParam.trim());
  // tab slug를 SearchTab로 해석한다. 없거나 알 수 없으면 사람(people)이 기본 활성이다.
  const activeTab = $derived(parseSearchTab(page.url.searchParams.get('tab')));
  const shouldSearchPeople = $derived(activeTab === SearchTab.PEOPLE && trimmedQuery.length > 0);

  const sessionQuery = createQuery(
    graphql(`
      query SearchPageSessionQuery {
        currentSession {
          id
          selectedProfile {
            id
          }
        }
      }
    `),
  );

  const peopleQuery = createQuery(
    graphql(`
      query SearchPeopleByHandlePageQuery($handle: String!) {
        profileByHandle(handle: $handle) {
          ...ProfileListItem_profile
          ...FollowButton_profile
        }
      }
    `),
    () => ({ handle: trimmedQuery }),
    () => ({ skip: !shouldSearchPeople }),
  );
  const searchedProfile = $derived(peopleQuery.data?.profileByHandle ?? null);
  const viewerProfileId = $derived(sessionQuery.data?.currentSession?.selectedProfile?.id ?? null);

  // 단계 구분(검색바 포커스 기준):
  // - input  : 검색바 포커스 = 입력 중 → 최근 검색 노출
  // - results: 포커스 해제 + q 있음 = 검색 후 → 탭 + 결과
  // - before : 그 외 = 검색 전 → 안내
  let focused = $state(false);
  const phase = $derived(focused ? 'input' : queryParam ? 'results' : 'before');

  // 입력 중 값. 초기값을 URL의 q로 두어 deep-link(`/search?q=foo`)·SSR·JS 비활성에서도
  // 검색창과 결과 영역이 처음부터 같은 검색어를 가리키게 한다. 이후 포커스가 없을 때만 q와
  // 동기화해(타이핑 중 덮어쓰기 방지) 이동·뒤로가기에 맞춘다.
  let inputValue = $state(untrack(() => queryParam));
  $effect(() => {
    if (!focused) {
      inputValue = queryParam;
    }
  });

  let recent = $state<string[]>([]);
  onMount(() => {
    recent = getRecentSearches();
  });

  // 검색이 수행되면(q 존재) 그 검색어를 최근 검색에 기록한다.
  // 제출은 네이티브 GET 폼이 처리하므로, 제출 핸들러 대신 URL의 q를 보고 여기서 기록한다.
  $effect(() => {
    if (queryParam) {
      recent = addRecentSearch(queryParam);
    }
  });

  // q·tab을 검색 URL로 만든다. 최근 검색·뒤로가기는 이 URL을 그대로 <a href>로 쓴다.
  // (네이티브 링크라 키보드 Enter·마우스·새 탭 열기가 모두 동작하고, 별도 포커스 처리가 필요 없다.)
  const searchUrl = (q: string, tab: SearchTab) => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set('q', q.trim());
    }
    params.set('tab', tab);
    return `/search?${params.toString()}`;
  };

  const handleSelectTab = (tab: SearchTab) => {
    void goto(searchUrl(queryParam, tab), { noScroll: true });
  };

  const handleRemoveRecent = (term: string) => {
    recent = removeRecentSearch(term);
  };

  // 지우기 ×: 입력값을 비우고(SearchBar) 포커스를 유지해 입력 중 단계를 이어간다.
  // 검색 후였다면 URL q도 제거하되 keepFocus로 포커스를 지켜 결과로 넘어가지 않게 한다.
  const handleClear = () => {
    if (queryParam) {
      void goto(searchUrl('', activeTab), { noScroll: true, keepFocus: true });
    }
  };
</script>

<section class="flex w-[min(100%,37.5rem)] flex-col self-start">
  <!-- 검색 입력 영역(검색바 + 입력 중 최근 검색)의 포커스를 한데 추적한다.
       다음 포커스 대상이 이 영역 안(예: 최근 검색 링크로 Tab)일 때만 focused를 유지하고,
       밖으로 나가면(이동 후 SvelteKit의 포커스 복귀 포함) 입력 중 단계를 닫는다(focus-within).
       display: contents라 flex 레이아웃에는 영향이 없다. -->
  <div
    class="contents"
    onfocusin={() => (focused = true)}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        focused = false;
      }
    }}
  >
    <!-- 검색 제출은 네이티브 GET 폼이 처리한다(Enter → /search?q=…&tab=…). display:contents라 레이아웃 영향 없음. -->
    <form method="get" action="/search" class="contents" data-sveltekit-noscroll>
      <input type="hidden" name="tab" value={activeTab} />
      <SearchBar
        bind:value={inputValue}
        placeholder="검색어를 입력하세요"
        backHref={phase !== 'before' ? searchUrl('', activeTab) : undefined}
        onclear={handleClear}
        class="w-full"
      />
    </form>

    {#if phase === 'input'}
      <RecentSearches
        terms={recent}
        hrefFor={(term) => searchUrl(term, activeTab)}
        onremove={handleRemoveRecent}
        class="w-full"
      />
    {/if}
  </div>

  {#if phase === 'results'}
    <SearchTabs active={activeTab} onselect={handleSelectTab} class="w-full" />
    {#if activeTab === SearchTab.PEOPLE}
      <SearchResults
        query={queryParam}
        profile={searchedProfile}
        loading={shouldSearchPeople && peopleQuery.loading}
        error={shouldSearchPeople && Boolean(peopleQuery.error)}
        onRetry={peopleQuery.refetch}
        class="w-full"
      >
        {#snippet action(profile)}
          {#if viewerProfileId}
            <FollowButton {profile} {viewerProfileId} class="shrink-0" />
          {/if}
        {/snippet}
      </SearchResults>
    {:else}
      <div class="px-4 py-12 text-center">
        <p class="text-text-primary text-base font-semibold">준비 중인 검색이에요</p>
        <p class="text-text-secondary mt-1 text-sm">
          {SEARCH_TAB_LABELS[activeTab]} 검색은 곧 제공될 예정이에요.
        </p>
      </div>
    {/if}
  {:else if phase === 'before'}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">프로필을 검색해보세요</p>
      <p class="text-text-secondary mt-1 text-sm">
        handle을 입력하면 일치하는 프로필을 찾아드려요.
      </p>
    </div>
  {/if}
</section>
