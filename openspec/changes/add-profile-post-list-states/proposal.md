# Proposal: add-profile-post-list-states

## Why

프로필 페이지(`/@{handle}`)의 게시글 목록 영역이 아직 "게시글 목록은 추후 제공됩니다." placeholder 한 줄뿐이다(PROD-88의 서브이슈 PROD-123). 프로필별 게시글 목록 조회 query(PROD-120)는 아직 머지되지 않았지만, 그 머지를 기다리지 않고 목록 영역 골격과 로딩 스켈레톤·빈 상태 UI를 먼저 구현해 실데이터 연결(PROD-124)이 UI 작업 없이 query 교체만으로 끝나게 한다.

## What Changes

- 프로필 페이지(`(tabs)/@[handle]/+page.svelte`)의 placeholder 문구를 게시글 목록 영역 골격으로 교체한다. `ProfileHero` 아래에 목록 영역이 자리잡는다.
- 목록의 로딩 스켈레톤과 게시글 없음 빈 상태를 표시하는 `PostList` 컴포넌트(`lib/components/PostList.svelte`, 신규)를 추가한다.
  - 로딩: 게시글 형태(좌측 아바타 거터 + 우측 이름·본문 줄)의 스켈레톤 아이템을 반복 표시하고 스크린리더용 로딩 안내를 제공한다. 기존 `TextSkeleton`을 재사용하며, 마크업은 게시글 디테일(PROD-89)의 로딩 스켈레톤 패턴을 따른다.
  - 빈 상태: 기존 인라인 빈 상태 패턴(중앙 정렬 제목+보조 설명)으로 "아직 게시글이 없어요" / "첫 게시글이 올라오면 여기에 표시돼요."를 표시한다. Figma에 Empty feed 디자인이 아직 없어 확립된 코드 패턴을 따른다.
- 페이지에는 게시글 디테일(PROD-89)과 같은 더미 분기 골격을 둔다: 미래 query 결과와 같은 모양의 더미 상수 한 곳에서 loading/empty 분기를 공급하며 기본값은 loading이다. PROD-124에서 이 상수만 `createQuery`로 1:1 교체한다.
- Storybook 스토리(`KOSMO/PostList`: 로딩·빈 상태)를 추가해 백엔드 없이 상태별 화면을 리뷰할 수 있게 한다.
- (Non-goals) 실데이터 연결과 목록 아이템 렌더링(PROD-124), 게시글 디테일로의 이동 링크(PROD-111), 목록 조회 오류 상태(query가 생기는 PROD-124에서 처리), 페이지네이션·무한 스크롤은 본 체인지의 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 프로필 페이지에 게시글 목록 영역 골격, 목록 로딩 스켈레톤, 게시글 없음 빈 상태 표시 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/@[handle]/+page.svelte`(교체), `lib/components/PostList.svelte`·`lib/components/PostList.stories.svelte`(신규).
- 재사용: `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), 시맨틱 디자인 토큰(신규 토큰 불필요), 게시글 디테일의 로딩·빈 상태 마크업 패턴.
- 소비 API: 없음(더미 상태). 목록 query 연결은 별도 서브이슈 PROD-124(PROD-120 의존)에서 진행한다. 백엔드 변경 없음.
- 의존: 기존 `(tabs)/@[handle]` 프로필 라우트(PROD-91) 위에 얹히며, main에 머지된 컴포넌트만 사용하므로 다른 미머지 브랜치에 의존하지 않는다.
