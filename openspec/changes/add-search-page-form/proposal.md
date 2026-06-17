# Proposal: add-search-page-form

## Why

`/search` 화면이 아직 "사용자와 콘텐츠를 빠르게 검색합니다." 헤더 한 블록뿐인 placeholder다(PROD-153). 실제 검색 결과 연결(PROD-154, 정확 handle 조회) 전에 검색 입력·submit 흐름과 결과 유형 탭, 그리고 검색 상태 UI(입력 전·로딩·오류·결과 없음)를 먼저 구현해, query 연결 시 상태만 전환하면 되도록 골격을 마련한다. 이는 `add-profile-post-list-states`(PROD-123)가 게시글 목록 상태 UI를 조회 없이 먼저 구현하고 PROD-124에서 데이터를 연결한 패턴과 같다.

검색은 앞으로 post 검색(Elasticsearch)·fediverse(ActivityPub)로 확장되므로(인기/최신/미디어 탭이 그 자리), 검색어와 활성 탭을 URL을 source of truth로 다뤄 deep-link·공유·탭 확장에 대비한다. 이번 범위에서는 `사람` 탭의 정확 handle 검색만 대상으로 한다.

## What Changes

- 검색 페이지(`(tabs)/(protected)/search/+page.svelte`)의 placeholder를 검색 입력 폼 + 결과 유형 탭 + 상태 영역으로 교체한다.
- 기존 표시 전용 `SearchBar.svelte`를 인터랙티브 입력으로 발전시킨다: 정적 텍스트를 실제 `<input>`(`bind:value`)로 바꾸고, 비우기(`×`)와 submit(Enter/폼)을 처리한다. 디자인상 불필요한 Back affordance는 추가하지 않는다.
- 기존 표시 전용 `SearchTabs.svelte`(인기/최신/미디어/사람)를 인터랙티브화한다: 탭 선택 동작을 추가하고, 활성 탭을 URL 파라미터 `tab`(`popular|latest|media|people`)에 반영한다. `tab`이 없으면 `people`(사람)을 기본 활성으로 둔다.
- 검색어를 URL 파라미터 `q`에 반영한다. submit 시 `q`를, 탭 전환 시 `tab`을 갱신하며 서로의 값을 유지한다.
- 사람 탭의 상태 영역을 표시하는 `SearchResults` 컴포넌트(`lib/components/SearchResults.svelte`, 신규)를 추가한다. 입력 전(idle)·로딩 스켈레톤·오류(+재시도)·결과 없음(empty) 상태를 표시하고, `PostList`의 상태 패턴과 시맨틱 토큰·접근성 안내를 따른다. 실제 검색 query는 연결하지 않고 `TODO(PROD-154)` seam을 남긴다.
- 사람 외 탭(인기·최신·미디어)은 관련 검색 백엔드가 준비되기 전까지 "준비 중" 안내를 표시한다.
- Storybook 스토리(`KOSMO/SearchResults`: idle·로딩·오류·결과 없음)를 추가하고, `SearchBar`·`SearchTabs` 스토리를 인터랙티브 형태로 갱신해 백엔드 없이 상태별 화면을 리뷰할 수 있게 한다.
- (Non-goals) 실제 검색 query 연결·결과 목록 렌더·프로필 이동(PROD-154), 인기/최신/미디어 탭 콘텐츠와 트렌딩 포스트, post(Elasticsearch)·fediverse 검색, handle 입력 정규화 정책 신규 정의는 본 체인지 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 검색 페이지에 검색 입력 폼, 검색어·활성 탭의 URL 반영, 결과 유형 탭(미준비 탭 안내 포함), 사람 탭의 입력 전·로딩·오류·결과 없음 상태 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/(protected)/search/+page.svelte`(교체), `lib/components/SearchBar.svelte`·`lib/components/SearchTabs.svelte`(인터랙티브화), `lib/components/SearchResults.svelte`·`lib/components/SearchResults.stories.svelte`(신규), `lib/components/SearchBar.stories.svelte`·`lib/components/SearchTabs.stories.svelte`(갱신).
- 재사용: `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), `PostList`의 로딩/오류/빈 상태 마크업 패턴, 시맨틱 디자인 토큰(신규 토큰 불필요), `goto`/`page.url.searchParams`(URL 상태).
- 소비 API: 없음. 백엔드 변경 없음. 정확 handle 결과 연결은 PROD-154에서 `profileByHandle`로 한다.
- 의존: 기존 `(tabs)/(protected)/search` 보호 라우트(PROD-148) 위에 얹힌다.
