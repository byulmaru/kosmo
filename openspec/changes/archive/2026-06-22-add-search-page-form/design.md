# Design: add-search-page-form

## Context

검색 페이지 `(tabs)/(protected)/search/+page.svelte`는 placeholder 헤더 한 블록에서 시작한다. 상위 `(protected)/+layout.svelte`가 세션 가드를 처리한다. `lib/components`에 표시 전용 `SearchBar.svelte`(🔍 + 정적 텍스트 + `×`)와 `SearchTabs.svelte`(인기/최신/미디어/사람, `role=tablist`, onclick 없음)가 이미 있고, Figma Search 화면(917:1380)과 대응한다. 상태 UI는 `PostList.svelte`가 로딩 스켈레톤·오류(+재시도)·빈 상태 패턴을 확립해 두었다. 네비게이션은 `goto`(`$app/navigation`)와 `page.url.searchParams`(`$app/state`)를 쓴다.

## Goals / Non-Goals

**Goals:**

- 검색 입력 + submit + 비우기를 제공하고, 검색어를 URL `q`에 반영한다.
- 검색 전·입력 중·검색 후 단계를 검색바 포커스 + `q`로 구분한다. 결과 유형 탭은 검색 후에만 노출한다.
- 입력 중 단계에 localStorage 기반 최근 검색을 노출한다(백엔드 없음).
- 결과 유형 탭(인기/최신/미디어/사람)을 동작시키고, 활성 탭을 URL `tab`에 반영한다(기본 `people`). 미준비 탭은 안내를 표시한다.
- 검색 후 사람 탭에서 `profileByHandle` 정확 handle 조회를 실행하고, 결과 있음/없음·로딩·오류 상태를 표시한다.
- 검색 결과는 `ProfileListItem`으로 렌더하고, 프로필 페이지 이동과 기존 팔로우 액션 표시 정책을 연결한다.

**Non-Goals:**

- 인기/최신/미디어 탭 콘텐츠·트렌딩 포스트·post(Elasticsearch)·fediverse 검색.
- handle 입력 정규화 정책 신규 정의.

## Decisions

- **검색어·활성 탭을 URL을 source of truth로 둔다.** 로컬 상태 대안과 비교해, deep-link·공유·뒤로가기와 향후 탭(post/fediverse) 확장에 자연스럽다. `q`는 검색어, `tab`은 `popular|latest|media|people`이며 기본은 `people`. **검색 제출은 페이지가 소유한 네이티브 GET 폼**(`<form method="get" action="/search">` + hidden `tab`)으로 두어 Enter가 브라우저(SvelteKit) 기본 내비게이션으로 처리되게 하고(검색어 기록은 제출 핸들러 대신 `q`를 보는 effect에서 한다), 탭 전환은 값을 유지한 채 `goto`로 갱신한다. PROD-154는 `q`(+`tab=people`)를 읽어 `profileByHandle`로 연결한다.
- **검색어는 타입 비종속 제네릭 `q`로 둔다.** 이번 사이클은 `q`를 정확 handle로 해석하지만, 파라미터 이름을 `handle`로 굳히지 않아 post/fediverse 탭이 추가돼도 계약을 바꾸지 않는다.
- **사람 탭만 정확 handle query를 실행한다.** `activeTab === SearchTab.PEOPLE`이고 `q.trim()`이 있을 때만 `profileByHandle(handle: q)`를 호출한다. 검색 제출·최근 검색·뒤로가기는 네이티브 form/link 흐름을 유지하고, 검색 전 상태나 미준비 탭에서 빈 handle query가 나가지 않도록 Mearie `skip` 옵션을 사용한다.
- **검색 단계를 검색바 포커스로 구분한다.** 검색바 포커스 = 입력 중(최근 검색), 포커스 해제 + `q` 있음 = 검색 후(탭 + 결과), 그 외 = 검색 전(안내). 결과 유형 탭은 검색 후에만 노출한다. **최근 검색 항목과 뒤로가기(←)는 검색 URL로 가는 네이티브 `<a href>` 링크로 둔다** — 키보드 Enter·마우스·새 탭 열기가 모두 동작하고, 이동 후 SvelteKit이 포커스를 본문으로 되돌려(`focusout`) 입력 중 단계가 자연히 닫히므로 `onclick`+수동 blur나 `onmousedown` preventDefault 같은 포인터 전용 처리가 필요 없다(리뷰 반영). 삭제(×)는 URL 이동이 아니라 로컬(localStorage) 동작이라 버튼으로 둔다. 포커스 추적은 검색 입력 영역(검색바 + 최근 검색)에 `focusin`/`focusout`(focus-within)으로 두고 다음 포커스 대상이 영역 밖일 때만 `focused`를 해제한다 — input의 blur만으로 끄면 키보드로 입력에서 최근 검색 링크로 Tab 이동할 때 영역이 먼저 언마운트돼 포인터 사용자만 동작하기 때문이다(Codex 리뷰 반영). 결과 영역(탭/결과)은 이 영역 밖이라 결과 탭 포커스가 입력 중으로 잘못 전환되지 않는다.
- **최근 검색은 localStorage로 처리한다.** 추천·자동완성은 백엔드가 필요하므로 제외하고, 입력 중 단계 콘텐츠는 사용자의 제출 이력을 `lib/utils/recentSearches.ts`(`browser` 가드)에 저장해 노출한다.
- **상태 UI를 `SearchResults` 컴포넌트로 분리한다.** Storybook에서 상태별 화면을 확인하기 위해 페이지 인라인 대신 컴포넌트로 둔다. `PostList`와 같은 `loading && !profile` / `error && !profile` 형태로 검색 후 사람 탭의 로딩·오류·결과 있음·결과 없음을 표시한다.
- **프로필 이동은 `ProfileListItem`의 정보 영역 링크로 제공한다.** 검색 결과 항목 안에는 `FollowButton`이 함께 있으므로 row 전체를 `<a>`로 감싸지 않는다. 아바타·이름·handle·bio 영역만 `/@{handle}` 링크가 되고, 팔로우 버튼은 독립 버튼으로 유지한다. 호출부가 `href` 문자열을 계산해 넘기지 않고, `ProfileListItem`의 `linked` variant가 자신의 fragment `handle`로 프로필 URL을 만든다.
- **팔로우 액션은 현재 `ProfileListItem`/`FollowButton` 계약을 사용한다.** 검색 query에서 `currentSession.selectedProfile.id`를 함께 조회해 `viewerProfileId`로 전달한다. 이 props 경계는 PR #133 리뷰에서 후속 개선 대상으로 분리된 상태이며, 책임 경계 재정리는 PROD-170에서 다룬다.
- **기존 `SearchBar`/`SearchTabs`를 발전시킨다.** 새 컴포넌트를 만들지 않고 표시 전용 컴포넌트를 인터랙티브화해, 디자인 대응과 사용처를 유지한다.
- **탭 정의(slug)를 `@kosmo/core/search`에 둔다.** 탭을 한글 이름이 아니라 slug(`popular|latest|media|people`)로 식별하고, `SearchTab`·`SEARCH_TABS`·`DEFAULT_SEARCH_TAB`·`parseSearchTab`를 core에 두어 향후 post(Elasticsearch)·fediverse 검색의 백엔드 결과 분기와 정의를 공유한다(리뷰 반영). 한글 라벨(인기/최신/미디어/사람)은 표시 전용이라 `SearchTabs.svelte` module의 `SEARCH_TAB_LABELS`로만 매핑하고, 페이지는 `parseSearchTab`로 `tab`을 해석한다. 검색 컴포넌트 4종(+스토리)은 `lib/components/Search/` 폴더로 모아 `components/` 최상위 파일 수를 줄인다.
- **검색바 외형을 단계별로 구분한다.** 검색바 아래 영역만 바뀌면 검색 전·입력 중·검색 후가 검색바에서 구분되지 않아, 검색바 자체에 단계 신호를 준다(트위터 웹·Figma 검색바 참조). ① 입력 중에는 검색바에 포커스 강조(`focus-within:outline-2 outline-offset-2 outline-more` — `TextField`/`TextArea`/`Button`과 동일한 시스템 표준)와 검색 아이콘 색 강조(`group-focus-within:text-more`)를 준다. ② 비우기(`×`)는 입력값이 있을 때만(`{#if value}`) 필드 *안*에 노출해 상시 노출로 인한 혼란을 없앤다. ×는 입력값을 비우고 포커스를 유지하며(→ 입력 중), 검색 후였다면 페이지 콜백(`onclear`)으로 URL `q`도 제거한다 — URL이 source of truth라 입력값만 비우면 빈 검색창 아래 이전 검색어의 탭/결과가 남기 때문(×=지우고 다시 입력, ←=검색 전 복귀로 역할 분리). ③ 검색 전이 아닌 단계(입력 중·검색 후)에는 좌측에 뒤로가기(`←`, Figma 검색바의 back 아이콘 반영)를 노출하고, 누르면 검색 전(`q` 없음) URL로 이동해 검색 전으로 되돌린다(네이티브 `<a href>` 링크 — 이동 후 SvelteKit의 포커스 복귀로 단계가 닫힌다). ④ 검색바는 웹 컬럼(최대 600px)에서 빈약하지 않도록 인풋 표준 크기(`h-11`/`text-sm`/아이콘 `size-5`)로 키우고, 고정 높이 대신 `py`로 두어 포커스 outline이 잘리지 않게 한다. (초기에는 Back을 생략했으나, 웹에서도 단계 구분이 필요하다는 사용자 피드백으로 채택.)
- **미준비 탭은 "준비 중" 안내로 처리한다.** 인기/최신/미디어는 post 검색 백엔드가 없으므로 빈 화면 대신 확립된 빈 상태 패턴(`px-4 py-12 text-center`)으로 준비 중 안내를 표시한다.
- **상태 마크업은 기존 패턴을 따른다.** 로딩 스켈레톤은 `ProfileListItem` 행 형태(아바타 거터 + 텍스트 줄)로 `TextSkeleton`을 재사용하고, 오류는 `role=alert`+재시도, 빈/idle/준비중은 인라인 중앙 정렬 패턴을 쓴다. 색·반경은 시맨틱 토큰으로 라이트/다크에 대응한다.

## Risks / Trade-offs

- [인기/최신/미디어 탭이 당분간 "준비 중"이라 사용자에게 미완성으로 보일 수 있다] → 탭 골격과 URL 계약을 먼저 확정해 두면 백엔드 준비 시 콘텐츠만 끼우면 된다. 트렌딩/탭 콘텐츠는 별도 후속 이슈로 분리한다.
- [검색바에 뒤로가기(←)를 더하면 웹 데스크톱 맥락에서 과해 보일 수 있다] → 초기에는 생략했으나, 검색 전·입력 중·검색 후가 검색바에서 구분되지 않는다는 사용자 피드백으로 채택했다(트위터 모바일·Figma 검색바 패턴, 포커스 해제·검색 전 복귀라는 분명한 동작). 데스크톱에서 과하다는 판단이 서면 후속에서 조정한다.
- [`SearchBar` base 높이를 바꾸면 Header(`search_main`) 소비처의 `h-8`/`[&>div]:h-8` 오버라이드와 충돌할 수 있다] → base는 고정 높이(`h-14`)를 유지해 Header가 같은 `h-` 그룹으로 깔끔히 덮어쓰게 한다(고정 높이 대신 `py`를 쓰면 Header의 `h-8`이 패딩을 못 덮어 높이가 깨진다).
- [검색 query와 탭 URL 상태가 어긋날 수 있다] → 사람 탭 + trim된 `q`가 있을 때만 query를 실행하고, 다른 탭에서는 준비 중 안내만 표시한다.
- [검색 결과 항목에 링크와 팔로우 버튼이 함께 있어 interactive 중첩이 생길 수 있다] → row 전체 링크 대신 프로필 정보 영역만 링크로 만든다.
- [`viewerProfileId`가 `ProfileListItem`까지 전달되는 책임 경계가 남는다] → PROD-154에서는 현재 완료된 PR #133 계약을 사용하고, FollowButton/viewer session 책임 재정리는 PROD-170 후속으로 둔다.
