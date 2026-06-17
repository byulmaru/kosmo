# Tasks: add-search-page-form

## 1. SearchBar 인터랙티브화

- [x] 1.1 `lib/components/SearchBar.svelte`의 정적 `<span>{query}</span>`를 실제 `<input bind:value>`로 바꾸고, placeholder·🔍·pill 스타일/치수를 유지한다
- [x] 1.2 `×` 비우기 버튼에 동작을 연결하고(포커스 유지), Enter/폼 submit을 `onsubmit?` 콜백으로 emit한다
- [x] 1.3 포커스 콜백(`onfocus`/`onblur`)과 입력 포커스를 거두는 `blurInput()` 메서드를 추가하고, submit 시 입력 포커스를 해제한다
- [x] 1.4 `SearchBar.stories.svelte`를 인터랙티브 입력 형태로 갱신한다

## 2. SearchTabs 인터랙티브화 + URL 연동

- [x] 2.1 `lib/components/SearchTabs.svelte`의 각 탭 `<button>`에 선택 동작(`onselect?: (tab) => void`)을 추가한다
- [x] 2.2 URL 파라미터 `tab`(`popular|latest|media|people`)과 탭 라벨(인기/최신/미디어/사람)의 매핑을 페이지에 정의한다. 기본 활성은 `people`(사람)

## 3. 최근 검색 (입력 중)

- [x] 3.1 `lib/utils/recentSearches.ts`를 추가한다. `browser` 가드 + localStorage로 get/add(중복 제거·최대 8)/remove/clear를 제공한다
- [x] 3.2 `lib/components/RecentSearches.svelte`를 추가한다. 최근 검색 목록·개별 삭제를 표시하고, 항목/삭제 버튼은 `onmousedown` preventDefault로 입력 포커스를 유지한다. 내역 없음 빈 상태 포함
- [x] 3.3 `RecentSearches.stories.svelte`(`KOSMO/RecentSearches`): 내역 있음·없음 스토리

## 4. SearchResults 컴포넌트 (검색 후 사람 탭)

- [x] 4.1 `lib/components/SearchResults.svelte`를 추가한다. `query?`·`loading?`·`error?`·`onRetry?` props를 받고, 실제 query는 `TODO(PROD-154)` 주석으로 남긴다
- [x] 4.2 상태 분기: 로딩(`ProfileListItem` 형태 스켈레톤 + `TextSkeleton` + `sr-only role=status`) / 오류(`role=alert` + 다시 시도) / 결과 없음(empty)
- [x] 4.3 `SearchResults.stories.svelte`(`KOSMO/SearchResults`)에 입력 전·로딩·오류·결과 없음 스토리를 추가한다

## 5. 검색 페이지 단계 조립

- [x] 5.1 `(tabs)/(protected)/search/+page.svelte`의 placeholder를 단계 레이아웃으로 교체한다. 검색바 포커스 + `q`로 `before`/`input`/`results` 단계를 파생한다
- [x] 5.2 검색 전 → 안내, 입력 중 → `RecentSearches`, 검색 후 → `SearchTabs` + (`people`이면 `SearchResults`, 그 외 준비 중)을 렌더한다
- [x] 5.3 submit → `goto('/search?q=…&tab=…')`(탭 유지) + 최근 검색 추가, 탭 전환 → `goto('?tab=…')`(q 유지), 최근 검색 선택 → 검색 후 입력 포커스 해제

## 6. 검증

- [x] 6.1 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [x] 6.2 `pnpm lint:eslint`, `pnpm --filter @kosmo/web build-storybook` 통과를 확인한다 (변경 파일 prettier는 pre-commit lint-staged의 `prettier --write`로 검증)
- [x] 6.3 `openspec validate add-search-page-form --strict` 통과를 확인한다

## 7. 후속 (이 체인지 범위 밖 · 별도 이슈/PR)

- [ ] 7.1 검색 후 사람 탭에 정확 handle `profileByHandle` query를 연결하고 `ProfileListItem` 결과·결과 없음·프로필 이동을 렌더한다 — PROD-154
- [ ] 7.2 검색 전 추천 프로필·트렌드, 입력 중 자동완성, 인기/최신/미디어 탭 콘텐츠(post/Elasticsearch·fediverse 검색) — 별도 후속 이슈
