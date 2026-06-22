# Proposal: add-search-page-form

## Why

`/search` 화면이 아직 "사용자와 콘텐츠를 빠르게 검색합니다." 헤더 한 블록뿐인 placeholder다(PROD-153). 먼저 검색 입력·submit 흐름과 검색 단계(검색 전·입력 중·검색 후) 레이아웃, 그리고 검색 후 상태 UI(로딩·오류·결과 없음)를 마련한다. 이어서 이번 Cycle 범위인 정확 handle 조회(PROD-154)를 기존 `profileByHandle` query와 `ProfileListItem`에 연결한다.

Figma·트위터 웹처럼 검색은 검색 전·입력 중·검색 후로 화면 구조가 달라야 한다. 추천·트렌드·자동완성 같은 백엔드 의존 콘텐츠는 이번 범위 밖이지만, 단계 구분 자체와 입력 중 단계의 최근 검색(localStorage)은 백엔드 없이 구현한다. 검색은 앞으로 post 검색(Elasticsearch)·fediverse(ActivityPub)로 확장되므로, 검색어와 활성 탭을 URL을 source of truth로 다뤄 deep-link·공유·탭 확장에 대비한다. 이번 범위에서는 `사람` 탭의 정확 handle 검색만 대상으로 한다.

## What Changes

- 검색 페이지(`(tabs)/(protected)/search/+page.svelte`)의 placeholder를 검색 단계(검색 전·입력 중·검색 후)에 따라 달라지는 레이아웃으로 교체한다. 단계는 **검색바 포커스 상태와 제출된 검색어(`q`)** 로 정한다.
  - **검색 전**(포커스 없음·`q` 없음): 검색 안내. 결과 유형 탭 없음.
  - **입력 중**(검색바 포커스): 최근 검색 목록. 결과 유형 탭 없음.
  - **검색 후**(포커스 없음·`q` 있음): 결과 유형 탭 + 결과 영역.
- 기존 표시 전용 `SearchBar.svelte`를 `lib/components/Search/SearchBar.svelte`의 표시 전용 입력으로 발전시키고, 검색 단계에 따라 검색바 자체의 외형도 달라지게 한다. 검색 제출은 페이지가 소유한 네이티브 GET 폼이 처리하고, `SearchBar`는 입력 `name="q"`와 비우기(`×`)·뒤로가기 링크 표시를 담당한다. 입력 중에는 검색바에 포커스 강조(파란 `outline-more`)를, 입력값이 있을 때만 필드 안에 비우기(`×`)를 표시한다. 검색 전이 아닌 단계(입력 중·검색 후)에는 좌측에 뒤로가기(`←`) 링크를 노출해 검색 전 단계로 되돌릴 수 있게 한다(Figma 검색바의 back 아이콘 반영). 검색바는 웹에서 빈약하지 않도록 인풋 표준 크기(`h-11`/`text-sm`)로 키운다.
- 기존 표시 전용 `SearchTabs.svelte`(인기/최신/미디어/사람)를 인터랙티브화하고 **검색 후 단계에서만** 노출한다: 탭 선택 동작을 추가하고, 활성 탭을 URL 파라미터 `tab`(`popular|latest|media|people`)에 반영한다. `tab`이 없으면 `people`(사람)을 기본 활성으로 둔다. 탭은 한글 이름이 아니라 slug로 식별하고, `SearchTab`·`SEARCH_TABS`·`DEFAULT_SEARCH_TAB`·`parseSearchTab` 정의를 `@kosmo/core/search`에 두어 향후 백엔드 결과 분기와 공유한다. 한글 라벨은 표시 전용이라 `SearchTabs.svelte`의 `SEARCH_TAB_LABELS`로만 매핑한다.
- 검색어를 URL 파라미터 `q`에 반영한다. submit은 네이티브 GET 폼으로, 뒤로가기·최근 검색은 네이티브 `<a href>`로 처리한다. 탭 전환은 현재 검색어를 유지한 채 `tab`을 갱신한다.
- 입력 중 단계의 최근 검색을 위해 localStorage 유틸(`lib/utils/recentSearches.ts`, 신규)과 `RecentSearches` 컴포넌트(`lib/components/Search/RecentSearches.svelte`, 신규)를 추가한다. 최근 검색어 노출·선택·개별 삭제를 백엔드 없이 처리한다.
- 검색 후 사람 탭의 상태 영역을 표시하는 `SearchResults` 컴포넌트(`lib/components/Search/SearchResults.svelte`, 신규)를 추가한다. 로딩 스켈레톤·오류(+재시도)·결과 있음·결과 없음(empty) 상태를 표시하고, `PostList`의 상태 패턴과 시맨틱 토큰·접근성 안내를 따른다.
- 사람 탭에서 제출된 `q`가 있을 때 기존 `profileByHandle(handle: q)` query를 실행한다. `activeTab !== SearchTab.PEOPLE`이거나 trim된 검색어가 없으면 Mearie `skip`으로 query를 실행하지 않는다.
- 검색 결과가 있으면 `ProfileListItem`으로 표시한다. 결과 항목의 프로필 정보 영역은 `ProfileListItem`의 `linked` variant로 `/@{handle}`에 이동하고, `FollowButton`은 기존 `ProfileListItem` 계약대로 표시/숨김 처리된다.
- 팔로우 액션을 위해 `currentSession.selectedProfile.id`를 함께 조회해 현재 `ProfileListItem`의 `viewerProfileId` props로 전달한다. 이 viewer/session 책임 경계는 PR #133 리뷰에서 후속 이슈(PROD-170)로 분리된 상태라 이번 범위에서는 재설계하지 않는다.
- 사람 외 탭(인기·최신·미디어)은 관련 검색 백엔드가 준비되기 전까지 "준비 중" 안내를 표시한다.
- Storybook 스토리(`KOSMO/SearchResults`: 입력 전·로딩·오류·결과 있음·결과 없음, `KOSMO/RecentSearches`: 내역 있음·없음)를 추가하고, `SearchBar` 스토리를 인터랙티브 형태로 갱신해 백엔드 없이 상태별 화면을 리뷰할 수 있게 한다.
- (Non-goals) 검색 전 추천 프로필·트렌드, 입력 중 자동완성, 인기/최신/미디어 탭 콘텐츠, post(Elasticsearch)·fediverse 검색, prefix/display name/fediverse 검색, handle 입력 정규화 정책 신규 정의, FollowButton/viewer session 책임 경계 재설계(PROD-170)는 본 체인지 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 검색 페이지에 검색 입력 폼, 검색어·활성 탭의 URL 반영, 검색 전·입력 중·검색 후 단계 구분, 입력 중 최근 검색, 검색 후 결과 유형 탭(미준비 탭 안내 포함), 사람 탭의 정확 handle 검색 결과/로딩/오류/결과 없음 상태 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/(protected)/search/+page.svelte`(교체 및 `profileByHandle` query 연결), `lib/components/Search/SearchBar.svelte`·`lib/components/Search/SearchTabs.svelte`(인터랙티브화), `lib/components/Search/SearchResults.svelte`·`lib/components/Search/RecentSearches.svelte`·각 `*.stories.svelte`(신규/갱신), `lib/components/ProfileListItem.svelte`(프로필 정보 영역 링크), `lib/utils/recentSearches.ts`(신규), `lib/components/Search/SearchBar.stories.svelte`(갱신). 검색 컴포넌트 4종+스토리는 `lib/components/Search/` 폴더로 모은다.
- 영향 코드(packages/core): `packages/core/search.ts`(신규, `SearchTab` slug 정의·`parseSearchTab`), `packages/core/package.json` `exports`에 `./search` 추가.
- 재사용: `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), `ProfileListItem`/`FollowButton`(결과 항목과 팔로우 액션), `PostList`의 로딩/오류/빈 상태 마크업 패턴, 시맨틱 디자인 토큰(신규 토큰 불필요), 네이티브 form/link + `goto`/`page.url.searchParams`(URL 상태), `browser`(localStorage 가드).
- 소비 API: 기존 `Query.profileByHandle`과 `currentSession.selectedProfile`만 사용한다. 백엔드 변경 없음.
- 의존: 기존 `(tabs)/(protected)/search` 보호 라우트(PROD-148) 위에 얹힌다.
