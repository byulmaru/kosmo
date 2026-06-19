# Design: add-search-page-form

## Context

검색 페이지 `(tabs)/(protected)/search/+page.svelte`는 placeholder 헤더 한 블록에서 시작한다. 상위 `(protected)/+layout.svelte`가 세션 가드를 처리한다. `lib/components`에 표시 전용 `SearchBar.svelte`(🔍 + 정적 텍스트 + `×`)와 `SearchTabs.svelte`(인기/최신/미디어/사람, `role=tablist`, onclick 없음)가 이미 있고, Figma Search 화면(917:1380)과 대응한다. 상태 UI는 `PostList.svelte`가 로딩 스켈레톤·오류(+재시도)·빈 상태 패턴을 확립해 두었다. 네비게이션은 `goto`(`$app/navigation`)와 `page.url.searchParams`(`$app/state`)를 쓴다.

## Goals / Non-Goals

**Goals:**

- 검색 입력 + submit + 비우기를 제공하고, 검색어를 URL `q`에 반영한다.
- 검색 전·입력 중·검색 후 단계를 검색바 포커스 + `q`로 구분한다. 결과 유형 탭은 검색 후에만 노출한다.
- 입력 중 단계에 localStorage 기반 최근 검색을 노출한다(백엔드 없음).
- 결과 유형 탭(인기/최신/미디어/사람)을 동작시키고, 활성 탭을 URL `tab`에 반영한다(기본 `people`). 미준비 탭은 안내를 표시한다.
- 검색 후 사람 탭의 로딩·오류·결과 없음 상태를 조회 없이 구현하고 Storybook으로 확인할 수 있게 한다.

**Non-Goals:**

- 실제 검색 query 연결·결과 목록 렌더·프로필 이동(PROD-154).
- 인기/최신/미디어 탭 콘텐츠·트렌딩 포스트·post(Elasticsearch)·fediverse 검색.
- handle 입력 정규화 정책 신규 정의.

## Decisions

- **검색어·활성 탭을 URL을 source of truth로 둔다.** 로컬 상태 대안과 비교해, deep-link·공유·뒤로가기와 향후 탭(post/fediverse) 확장에 자연스럽다. `q`는 검색어, `tab`은 `popular|latest|media|people`이며 기본은 `people`. submit/탭 전환은 서로의 값을 유지한 채 `goto`로 갱신한다. PROD-154는 `q`(+`tab=people`)를 읽어 `profileByHandle`로 연결한다.
- **검색어는 타입 비종속 제네릭 `q`로 둔다.** 이번 사이클은 `q`를 정확 handle로 해석하지만, 파라미터 이름을 `handle`로 굳히지 않아 post/fediverse 탭이 추가돼도 계약을 바꾸지 않는다.
- **검색 단계를 검색바 포커스로 구분한다.** 검색바 포커스 = 입력 중(최근 검색), 포커스 해제 + `q` 있음 = 검색 후(탭 + 결과), 그 외 = 검색 전(안내). 결과 유형 탭은 검색 후에만 노출한다. 최근 검색 항목/삭제 버튼은 `onmousedown` preventDefault로 입력 포커스를 유지해 클릭이 먼저 처리되게 하고, 항목 선택 후 `blurInput()`으로 검색 후 단계로 전환한다.
- **최근 검색은 localStorage로 처리한다.** 추천·자동완성은 백엔드가 필요하므로 제외하고, 입력 중 단계 콘텐츠는 사용자의 제출 이력을 `lib/utils/recentSearches.ts`(`browser` 가드)에 저장해 노출한다.
- **상태 UI를 `SearchResults` 컴포넌트로 분리한다.** Storybook에서 상태별 화면을 확인하기 위해 페이지 인라인 대신 컴포넌트로 둔다. `PostList`와 같은 `loading`/`error`/`onRetry` 형태로 검색 후 사람 탭의 로딩·오류·결과 없음을 표시한다. 실제 query는 `TODO(PROD-154)`로 남긴다.
- **기존 `SearchBar`/`SearchTabs`를 발전시킨다.** 새 컴포넌트를 만들지 않고 표시 전용 컴포넌트를 인터랙티브화해, 디자인 대응과 사용처를 유지한다.
- **검색바 외형을 단계별로 구분한다.** 검색바 아래 영역만 바뀌면 검색 전·입력 중·검색 후가 검색바에서 구분되지 않아, 검색바 자체에 단계 신호를 준다(트위터 웹·Figma 검색바 참조). ① 입력 중에는 검색바에 포커스 강조(`focus-within:outline-2 outline-offset-2 outline-more` — `TextField`/`TextArea`/`Button`과 동일한 시스템 표준)와 검색 아이콘 색 강조(`group-focus-within:text-more`)를 준다. ② 비우기(`×`)는 입력값이 있을 때만(`{#if value}`) 필드 *안*에 노출해 상시 노출로 인한 혼란을 없앤다. ③ 검색 전이 아닌 단계(입력 중·검색 후)에는 좌측에 뒤로가기(`←`, Figma 검색바의 back 아이콘 반영)를 노출하고, 누르면 포커스 해제 + `q` 제거로 검색 전으로 되돌린다(`onmousedown` preventDefault로 포커스를 빼앗지 않게 처리). ④ 검색바는 웹 컬럼(최대 600px)에서 빈약하지 않도록 인풋 표준 크기(`h-11`/`text-sm`/아이콘 `size-5`)로 키우고, 고정 높이 대신 `py`로 두어 포커스 outline이 잘리지 않게 한다. (초기에는 Back을 생략했으나, 웹에서도 단계 구분이 필요하다는 사용자 피드백으로 채택.)
- **미준비 탭은 "준비 중" 안내로 처리한다.** 인기/최신/미디어는 post 검색 백엔드가 없으므로 빈 화면 대신 확립된 빈 상태 패턴(`px-4 py-12 text-center`)으로 준비 중 안내를 표시한다.
- **상태 마크업은 기존 패턴을 따른다.** 로딩 스켈레톤은 `ProfileListItem` 행 형태(아바타 거터 + 텍스트 줄)로 `TextSkeleton`을 재사용하고, 오류는 `role=alert`+재시도, 빈/idle/준비중은 인라인 중앙 정렬 패턴을 쓴다. 색·반경은 시맨틱 토큰으로 라이트/다크에 대응한다.

## Risks / Trade-offs

- [인기/최신/미디어 탭이 당분간 "준비 중"이라 사용자에게 미완성으로 보일 수 있다] → 탭 골격과 URL 계약을 먼저 확정해 두면 백엔드 준비 시 콘텐츠만 끼우면 된다. 트렌딩/탭 콘텐츠는 별도 후속 이슈로 분리한다.
- [실제 query 없이 만든 로딩/오류/결과 없음 상태가 PROD-154 연결 시 미세하게 달라질 수 있다] → `PostList`와 동일한 `loading && !data` / `error && !data` 분기를 따르고 `SearchResults` props를 query 상태에 1:1 대응하게 설계해 교체 비용을 줄인다.
- [Figma SearchBar 인스턴스의 Back 아이콘을 생략한다] → 웹 탭 라우트 맥락상 불필요하다고 판단. 디자인 오너 확인이 필요하면 후속에서 반영한다.
