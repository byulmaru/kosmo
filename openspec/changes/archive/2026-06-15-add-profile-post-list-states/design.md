# Design: add-profile-post-list-states

## Context

프로필 페이지 `(tabs)/@[handle]/+page.svelte`는 placeholder 문구 한 줄에서 시작했다. 상위 `+layout.svelte`가 `profileByHandle` query로 프로필 로딩·오류·없음 상태를 처리하고 `ProfileHero`를 렌더한 뒤 `{@render children()}`으로 페이지를 표시한다. 게시글 목록 query(PROD-120)는 `Profile.posts` connection으로 main에 준비됐고, 목록 항목 컴포넌트(PROD-122)는 `PostListItem_post` fragment를 소비한다. 게시글 디테일(PROD-89)에서 로딩 스켈레톤·인라인 빈 상태 패턴이 확립되어 있다.

## Goals / Non-Goals

**Goals:**

- 프로필 페이지에 게시글 목록 영역을 추가하고, 로딩 스켈레톤·게시글 없음 빈 상태·오류 상태를 query 상태에 맞춰 표시한다.
- `Profile.posts(first: 20)` 첫 페이지를 `PostListItem` 목록으로 렌더한다(PROD-124).
- 게시글 목록 카드 전체를 `/@{handle}/{postId}` 디테일 페이지로 연결한다(PROD-111).
- Storybook에서 로딩·오류·빈 상태·게시글 있음·다건 목록을 확인할 수 있게 한다.

**Non-Goals:**

- 페이지네이션·무한 스크롤(PROD-134).
- 게시글 작성 후 프로필 게시글 목록 cache 갱신(PROD-135).
- TipTap 본문 렌더러 연결(PROD-133).

## Decisions

- **상태 UI와 목록 렌더링을 `PostList` 컴포넌트로 분리한다.** 페이지 인라인 마크업 대안과 비교해, Storybook에서 상태별 화면을 확인해야 하는 완료 기준을 충족하려면 컴포넌트가 필요하다. 프로필 페이지 전용 이름을 붙이지 않고 `PostList`로 둔다(리뷰 반영).
- **`PostList`는 `PostList_profile` fragment를 소비한다.** Mearie fragment component 패턴에 따라 `Profile.posts(first: 20)`와 `PostListItem_post` spread를 컴포넌트에 colocate한다. 부모는 `ProfilePostListPageQuery`에서 `...PostList_profile`를 spread해 fragment ref를 넘긴다.
- **정규화 cache를 위해 profile/post `id`를 query selection에 남긴다.** `PostList_profile`과 `PostListItem_post`도 `id`를 포함하지만, route query와 connection node selection에서 `id`를 명시해 Mearie normalized cache가 `Profile`/`Post` entity를 안정적으로 식별하게 한다.
- **첫 페이지는 `posts(first: 20)`만 조회한다.** 더 불러오기 UI와 cursor pagination은 PROD-134로 분리한다.
- **카드 전체 클릭은 overlay 링크로 처리한다.** `PostListItem`은 `post.id`와 작성자 `profile.handle`로 `/@{handle}/{postId}`를 만들고, 카드 배경 레이어에 상세 링크를 둔다. 콘텐츠 레이어는 기본적으로 `pointer-events-none`으로 링크에 클릭을 통과시키고, `더보기...` 같은 실제 컨트롤만 `pointer-events-auto`로 opt-out한다. 이렇게 하면 `<a>` 안에 `<button>`을 중첩하지 않고, 후속 액션 버튼도 같은 규칙으로 추가할 수 있다.
- **오류 상태는 query 실패와 기존 데이터 없음에만 표시한다.** 로딩/오류 중에도 fragment data가 있으면 기존 목록을 유지해 `+layout.svelte`의 `loading && !profile`, `error && !profile` 패턴과 맞춘다.
- **스켈레톤·빈 상태 마크업은 기존 패턴을 따른다.** 스켈레톤은 `PostListItem`의 실제 행 메트릭(`px-2 pt-2 pb-4`, 48px avatar, `border-b`)과 맞추고, 빈 상태는 확립된 인라인 패턴(`px-4 py-12 text-center`, 제목+보조 설명)을 따른다. Figma에 Empty feed 디자인이 없으므로 새 디자인을 발명하지 않고 코드 컨벤션을 따른다.

## Risks / Trade-offs

- [페이지 query가 layout query 뒤에 시작되어 첫 진입에서 네트워크 왕복이 하나 더 생길 수 있다] → page query colocation을 우선해 `PostList` fragment를 실제 사용 route에 둔다. layout이 page 전용 posts 데이터를 알게 하는 최적화는 체감 성능 문제가 확인되면 별도 변경에서 검토한다.
- [게시글 작성 후 `Profile.posts` connection cache가 stale하게 남을 수 있다] → create mutation 응답 설계나 cache invalidation이 필요하므로 PROD-135로 분리하고, 이 PR에는 TODO만 남긴다.
- [빈 상태 문구·레이아웃이 추후 Figma Empty feed 디자인과 달라질 수 있다] → 토큰 기반 마크업이라 디자인 확정 시 교체 비용이 작다.
