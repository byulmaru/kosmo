# Proposal: add-profile-post-list-states

## Why

프로필 페이지(`/@{handle}`)의 게시글 목록 영역이 아직 "게시글 목록은 추후 제공됩니다." placeholder 한 줄뿐이다(PROD-88의 서브이슈 PROD-123). 목록 영역 골격과 로딩 스켈레톤·빈 상태 UI를 먼저 구현하고, 프로필별 게시글 목록 조회 query(PROD-120)와 목록 항목 컴포넌트(PROD-122)가 준비된 뒤 실제 `Profile.posts` 데이터를 연결해 프로필 페이지에서 게시글 목록을 렌더한다(PROD-124). 사용자는 목록 카드에서 게시글 디테일(`/@{handle}/{postId}`)로 이동할 수 있어야 한다(PROD-111).

## What Changes

- 프로필 페이지(`(tabs)/@[handle]/+page.svelte`)의 placeholder 문구를 게시글 목록 영역으로 교체한다. `ProfileHero` 아래에 목록 영역이 자리잡는다.
- 목록의 로딩 스켈레톤, 게시글 없음 빈 상태, 오류 상태, 게시글 목록을 표시하는 `PostList` 컴포넌트(`lib/components/PostList.svelte`, 신규)를 추가한다.
  - 로딩: 게시글 형태(좌측 아바타 거터 + 우측 이름·본문 줄)의 스켈레톤 아이템을 반복 표시하고 스크린리더용 로딩 안내를 제공한다. 기존 `TextSkeleton`을 재사용하며, 마크업은 게시글 디테일(PROD-89)의 로딩 스켈레톤 패턴을 따른다.
  - 빈 상태: 기존 인라인 빈 상태 패턴(중앙 정렬 제목+보조 설명)으로 "아직 게시글이 없어요" / "첫 게시글이 올라오면 여기에 표시돼요."를 표시한다. Figma에 Empty feed 디자인이 아직 없어 확립된 코드 패턴을 따른다.
  - 오류 상태: 목록 query가 실패하고 표시할 기존 데이터가 없을 때 인라인 오류 상태와 재시도 버튼을 표시한다.
  - 게시글 목록: `PostList_profile` fragment에서 `Profile.posts(first: 20)` 첫 페이지를 조회하고 `PostListItem`에 `PostListItem_post` fragment ref를 전달한다.
- 게시글 목록 카드는 전체 클릭 영역으로 `/@{handle}/{postId}` 디테일 페이지에 연결한다. 카드 안의 `더보기...` 같은 별도 컨트롤은 자기 동작을 우선한다.
- 프로필 페이지에는 `ProfilePostListPageQuery`를 colocate해 `profileByHandle(handle: $handle) { id ...PostList_profile }`를 조회한다.
- Storybook 스토리(`KOSMO/PostList`: 로딩·오류·빈 상태·게시글 있음·다건 목록)를 추가해 백엔드 없이 상태별 화면을 리뷰할 수 있게 한다.
- (Non-goals) 페이지네이션·무한 스크롤(PROD-134), 게시글 작성 후 목록 cache 갱신(PROD-135), TipTap 본문 렌더러 연결(PROD-133)은 본 체인지의 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 프로필 페이지에 게시글 목록 영역, 실데이터 기반 목록 렌더링, 목록 로딩 스켈레톤, 게시글 없음 빈 상태, 목록 오류 상태, 목록 카드 상세 이동 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/@[handle]/+page.svelte`(교체), `lib/components/PostList.svelte`·`lib/components/PostList.stories.svelte`(신규), `lib/components/PostListItem.svelte`(상세 링크), `lib/components/PostComposer.svelte`(후속 cache TODO).
- 재사용: `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), `lib/components/PostListItem.svelte`(게시글 항목 fragment), 시맨틱 디자인 토큰(신규 토큰 불필요), 게시글 디테일의 로딩·빈 상태 마크업 패턴.
- 소비 API: `Profile.posts(first: 20)` connection을 `profileByHandle` 아래에서 조회한다. 백엔드 변경 없음.
- 의존: 기존 `(tabs)/@[handle]` 프로필 라우트(PROD-91), 프로필별 게시글 목록 조회 query(PROD-120), 게시글 목록 항목(PROD-122) 위에 얹힌다.
