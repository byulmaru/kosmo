# Tasks: add-search-page-form

## 1. SearchBar 인터랙티브화

- [ ] 1.1 `lib/components/SearchBar.svelte`의 정적 `<span>{query}</span>`를 실제 `<input bind:value>`로 바꾸고, placeholder·🔍·pill 스타일/치수를 유지한다
- [ ] 1.2 `×` 비우기 버튼에 동작을 연결하고, Enter/폼 submit을 `onsubmit?` 콜백으로 emit한다
- [ ] 1.3 `SearchBar.stories.svelte`를 인터랙티브 입력 형태로 갱신한다

## 2. SearchTabs 인터랙티브화 + URL 연동

- [ ] 2.1 `lib/components/SearchTabs.svelte`의 각 탭 `<button>`에 선택 동작(`onselect?: (tab) => void`)을 추가한다
- [ ] 2.2 URL 파라미터 `tab`(`popular|latest|media|people`)과 탭 라벨(인기/최신/미디어/사람)의 매핑을 정의한다. 기본 활성은 `people`(사람)
- [ ] 2.3 `SearchTabs.stories.svelte`를 활성/상호작용 형태로 갱신한다

## 3. SearchResults 컴포넌트 (사람 탭 상태)

- [ ] 3.1 `lib/components/SearchResults.svelte`를 추가한다. `query?: string`·`loading?`·`error?`·`onRetry?` props를 받고, 실제 query는 `TODO(PROD-154)` 주석으로 남긴다
- [ ] 3.2 상태 분기를 구현한다: 입력 전(idle 안내) / 로딩(`ProfileListItem` 형태 스켈레톤 + `TextSkeleton` + `sr-only role=status`) / 오류(`role=alert` + 다시 시도) / 결과 없음(empty)
- [ ] 3.3 `SearchResults.stories.svelte`(`KOSMO/SearchResults`)에 idle·로딩·오류·결과 없음 스토리를 추가한다

## 4. 검색 페이지 조립

- [ ] 4.1 `(tabs)/(protected)/search/+page.svelte`의 placeholder를 제거하고 `SearchBar` + `SearchTabs` + 콘텐츠 영역으로 교체한다
- [ ] 4.2 `q = searchParams.get('q')`, `tab = searchParams.get('tab') ?? 'people'`를 파생한다. SearchBar submit → `goto('/search?q=…&tab=…')`(탭 유지), SearchTabs onselect → `goto('?tab=…')`(q 유지)
- [ ] 4.3 콘텐츠를 활성 탭으로 분기한다: `people` → `SearchResults`(q 기반 상태, `TODO(PROD-154)`로 createQuery 교체 지점 명시), 그 외 → "준비 중" 안내

## 5. 검증

- [ ] 5.1 `mearie generate` 후 `pnpm --filter @kosmo/web check`(svelte-check) 통과를 확인한다
- [ ] 5.2 `pnpm lint:eslint`, `pnpm --filter @kosmo/web build-storybook` 통과를 확인한다 (변경 파일 prettier는 pre-commit lint-staged의 `prettier --write`로 검증)
- [ ] 5.3 `openspec validate add-search-page-form --strict` 통과를 확인한다

## 6. 후속 (이 체인지 범위 밖 · 별도 이슈/PR)

- [ ] 6.1 사람 탭에 정확 handle `profileByHandle` query를 연결하고 `ProfileListItem` 결과·결과 없음·프로필 이동을 렌더한다 — PROD-154
- [ ] 6.2 인기/최신/미디어 탭 콘텐츠와 트렌딩 포스트(post/Elasticsearch 검색) — 별도 후속 이슈
