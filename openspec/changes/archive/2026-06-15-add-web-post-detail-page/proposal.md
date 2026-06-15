## Why

게시글 URL로 단일 게시글을 직접 볼 수 있는 웹 게시글 디테일 페이지가 필요하다(PROD-89). 작성자 표시 컴포넌트(PROD-97)는 머지되어, 작성자 영역은 라우트 핸들 기준 `profileByHandle` 실쿼리 + `PostAuthorProfile`로 실데이터를 표시한다. 이 체인지의 머지 범위는 **핸들 URL 라우트, 프론트엔드 컴포넌트 골격, 작성자 실데이터 연결**로 한정한다. 단건 조회 query(PROD-93)가 아직 없어 **게시글 본문(Plain Text·작성 시각·공개 범위·상태)은 의도적으로 더미로 두며**, 본문 실데이터 연결은 **별도 서브이슈 PROD-110**(PROD-93 의존)으로 분리한다. 이 페이지는 PROD-91이 추가한 핸들 기반 프로필 라우트(`(tabs)/@[handle]`) 위에 얹힌다.

## What Changes

- `apps/web`에 게시글 디테일 라우트 `(tabs)/@[handle]/[postId]`를 추가한다. `/@{handle}/{postId}` 형식으로 접근한다.
- `+page@(tabs).svelte`로 레이아웃을 `(tabs)` 셸까지 리셋해, 상위 `@[handle]/+layout.svelte`의 작성자 `ProfileHero`를 건너뛰고 단독 게시글 뷰로 렌더한다. 사이드바·하단탭 셸은 유지한다.
- 게시글 기본 정보(Plain Text 본문, 작성자 표시 이름·핸들, 작성 시각, 공개 범위)를 표시한다. 작성자 영역은 `profileByHandle` 실쿼리 + `...PostAuthorProfile_profile` fragment로 `PostAuthorProfile` 컴포넌트를 렌더하고, `/@{handle}` 프로필로 링크한다. 로딩·조회 오류·없는 게시글 상태도 이 작성자 query에 매핑한다.
- 상단에 이전 화면으로 돌아가는 간단한 back 컨트롤을 둔다.
- 로딩·조회 오류·없는 게시글·삭제된 게시글(`state = DELETED`) 상태를 처리하며, 모든 상태에서 상위 `(tabs)` 셸을 유지한다.
- 본문·작성 시각·공개 범위 메타라인은 `lib/components/PostBody.svelte`(신규) fragment 컴포넌트로 분리한다. 기존 스키마의 `Post` 타입 위에 `PostBody_post` fragment(`content { bodyText }`, `createdAt`, `visibility`)를 선언하고, Storybook 스토리(`KOSMO/PostBody`: 본문 variant·공개 범위·빈 본문·작성자 조립)를 추가해 백엔드 없이도 레이아웃을 리뷰할 수 있게 한다. 피드·프로필 목록(PROD-111)에서 재사용한다.
- 작성자는 `profileByHandle` 실쿼리에서 공급하고, 게시글 본문(`Post`/`PostContent`, PR #67 shape)은 단건 조회 query가 없어 `PostBody_post` fragment ref 형태의 로컬 더미 한 곳에서 공급한다. 분기 조건은 작성자 query의 `loading`/`error`/데이터 null과 본문 `state`에 매핑하며, 본문 더미→`post` query 1:1 교체는 별도 서브이슈 PROD-110에서 진행한다.
- (Non-goals) 답글·반응·리포스트·ReplyComposer(Figma 풀 스레드 뷰), 실제 게시글 본문 조회 query 연결(PROD-110 서브이슈, PROD-93 의존), 프로필 게시글 목록→상세 이동 링크(PROD-111 서브이슈), 모바일 `(tabs)` 셸 헤더와 back 헤더 통합(별도 웹 레이아웃 이슈)은 본 체인지의 머지 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 핸들+게시글 ID 기반 디테일 라우트, `(tabs)` 레이아웃 리셋, 게시글 기본 정보 표시, 로딩/오류/없는 게시글/삭제됨 상태 처리, back 내비게이션 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/@[handle]/[postId]/+page@(tabs).svelte`(신규), `lib/components/PostBody.svelte`·`lib/components/PostBody.stories.svelte`(신규). `lib/index.ts` barrel export는 추가하지 않는다.
- 재사용: `lib/components/PostAuthorProfile.svelte`(작성자 표시 + `PostAuthorProfile_profile` fragment), `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), 시맨틱 디자인 토큰.
- 소비 API: `profileByHandle`(작성자, 기존 스키마). 게시글 본문은 더미이며, `post` 단건 조회 query 연결은 별도 서브이슈 PROD-110(PROD-93 의존)에서 진행한다. 백엔드 변경 없음.
- 의존: PROD-91(`(tabs)/@[handle]` 라우트·`profile.ts` 유틸) 위에 스택한다.
