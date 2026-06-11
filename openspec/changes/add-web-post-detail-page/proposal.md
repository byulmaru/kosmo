## Why

게시글 URL로 단일 게시글을 직접 볼 수 있는 웹 게시글 디테일 페이지가 필요하다(PROD-89). 다만 단건 조회 query(PROD-93)와 작성자 표시 컴포넌트(PROD-97)가 아직 없어, 이번 변경은 **라우트·UI·상태 처리 골격을 더미 데이터 기준으로 먼저 구현**한다. 실제 데이터 조회(`post` query)와 `PostAuthorProfile` 연결은 블로커가 머지된 뒤 **같은 브랜치(prod-89)에서 교체**하며, 더미 상태가 main에 머지되지는 않는다. 이 페이지는 PROD-91이 추가한 핸들 기반 프로필 라우트(`(tabs)/@[handle]`) 위에 얹힌다.

## What Changes

- `apps/web`에 게시글 디테일 라우트 `(tabs)/@[handle]/[postId]`를 추가한다. `/@{handle}/{postId}` 형식으로 접근한다.
- `+page@(tabs).svelte`로 레이아웃을 `(tabs)` 셸까지 리셋해, 상위 `@[handle]/+layout.svelte`의 작성자 `ProfileHero`를 건너뛰고 단독 게시글 뷰로 렌더한다. 사이드바·하단탭 셸은 유지한다.
- 게시글 기본 정보(Plain Text 본문, 작성자 표시 이름·핸들, 작성 시각, 공개 범위)를 표시한다. 작성자 영역은 `getProfileInitial` 기반 이니셜 placeholder로 두고, `/@{handle}` 프로필로 링크한다.
- 상단에 이전 화면으로 돌아가는 간단한 back 컨트롤을 둔다.
- 로딩·조회 오류·없는 게시글·삭제된 게시글(`state = DELETED`) 상태를 처리하며, 모든 상태에서 상위 `(tabs)` 셸을 유지한다.
- 데이터는 PR #67(PROD-92)에서 정의된 `Post`/`PostContent` GraphQL shape에 맞춘 로컬 더미 상수 한 곳에서 공급한다. 분기 조건은 향후 `createQuery`의 `loading`/`error`/데이터 null/`state`에 1:1로 매핑되도록 작성한다.
- (Non-goals) 답글·반응·리포스트·ReplyComposer(Figma 풀 스레드 뷰), 실제 `post` 조회 query 연결(PROD-93 후속·같은 브랜치), `PostAuthorProfile` 컴포넌트 연결(PROD-97 후속·같은 브랜치), 모바일 `(tabs)` 셸 헤더와 back 헤더 통합(별도 웹 레이아웃 이슈)은 본 체인지의 머지 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 핸들+게시글 ID 기반 디테일 라우트, `(tabs)` 레이아웃 리셋, 게시글 기본 정보 표시, 로딩/오류/없는 게시글/삭제됨 상태 처리, back 내비게이션 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/@[handle]/[postId]/+page@(tabs).svelte`(신규).
- 재사용: `lib/utils/profile.ts`(`getProfileInitial`), `lib/components/TextSkeleton.svelte`(로딩 스켈레톤), 시맨틱 디자인 토큰.
- 소비 API: 현재 없음(더미). PROD-93 머지 후 `post` 단건 조회 query를 같은 브랜치에서 연결한다. 백엔드 변경 없음.
- 의존: PROD-91(`(tabs)/@[handle]` 라우트·`profile.ts` 유틸) 위에 스택한다.
