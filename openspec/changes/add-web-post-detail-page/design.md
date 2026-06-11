## Context

PROD-89(게시글 디테일 페이지)는 단건 조회 query(PROD-93)와 작성자 표시 컴포넌트(PROD-97)에 블로킹돼 있었다. `PostAuthorProfile`(PR #72, PROD-97)이 머지되어 작성자 영역은 `profileByHandle` 실쿼리 + fragment로 실데이터를 표시한다. 다만 PR #67(PROD-92)이 `Post`/`PostContent` 타입과 `createPost` mutation을 추가했어도 단건 조회 query는 아직 없어, 게시글 본문만 의도적으로 더미로 두고, 본문 실데이터 연결은 별도 서브이슈 PROD-110(PROD-93 의존)으로 분리한다. 순수 프론트엔드(`apps/web`, SvelteKit + mearie GraphQL + Tailwind 시맨틱 토큰)이며, 디자인 기준은 Figma `🧵 Post Detail` 섹션의 anchor 포스트다. 이 변경은 PROD-91의 `(tabs)/@[handle]` 라우트 위에 스택한다.

## Goals / Non-Goals

**Goals:**

- 게시글 URL(`/@{handle}/{postId}`)로 단일 게시글 디테일에 직접 접근한다.
- 작성자 프로필 헤더(`ProfileHero`)가 아니라 단독 게시글 뷰로 렌더한다.
- Plain Text 본문·작성자·작성 시각을 표시하고, 로딩/오류/없는 게시글/삭제됨 상태가 깨지지 않게 한다.
- 더미→실데이터 교체 비용이 작도록, 더미를 한 곳에 모으고 상태 분기를 query 필드와 1:1 매핑되게 작성한다.

**Non-Goals:**

- 답글·반응·리포스트·ReplyComposer(Figma 풀 스레드 뷰).
- 실제 게시글 본문 조회 query 연결(PROD-110 서브이슈, PROD-93 의존).
- 프로필 게시글 목록→상세 이동 링크(PROD-111 서브이슈).
- 모바일 `(tabs)` 셸 헤더와 back 헤더 통합 — 별도 웹 레이아웃 이슈.

## Decisions

- **URL `/@{handle}/{postId}` (프로필 라우트 하위)**: 대안으로 `/posts/{postId}`(핸들 비의존 평면 경로)를 검토했으나, 작성자 핸들이 URL에 드러나고 프로필 라우트와 일관된 Mastodon식 `/@{handle}/{postId}`를 채택했다.
- **`+page@(tabs).svelte`로 레이아웃 리셋**: `@[handle]/+layout.svelte`는 모든 하위 라우트에 작성자 `ProfileHero`를 강제로 렌더한다. 게시글 디테일은 단독 뷰여야 하므로 `@(tabs)` 세그먼트로 레이아웃을 `(tabs)` 셸까지 리셋해 ProfileHero를 건너뛰되, 사이드바·하단탭 셸은 유지한다.
- **작성자 실데이터 + 본문 더미 분리**: 이 레포는 loader 파일 없이 컴포넌트 내 인라인 `createQuery`를 쓴다. 작성자는 스키마에 이미 있는 `profileByHandle`로 실쿼리하지만, 게시글 본문 조회 query는 스키마에 없어 진짜 query를 쓰면 mearie codegen이 깨진다. 따라서 본문(`content`/`createdAt`/`state`/`visibility`)만 PR #67의 `Post`/`PostContent` shape에 맞춘 로컬 더미로 한 곳에 두고, 별도 서브이슈 PROD-110에서 `post` `createQuery`로 1:1 교체되도록 구성한다.
- **작성자 실데이터(`profileByHandle` + fragment)**: 라우트가 `/@{handle}/{postId}`라 작성자=핸들 주인이므로, `profileByHandle(handle)` 실쿼리에 `...PostAuthorProfile_profile` fragment를 스프레드해 `PostAuthorProfile` 컴포넌트로 작성자를 표시하고 `/@{handle}`로 링크한다. 로딩/오류/없는 게시글 상태도 이 작성자 query에 매핑한다(`@[handle]/+layout.svelte`의 `profileByHandle` + fragment 패턴과 동일).
- **back 헤더 최소화**: Figma `back_title_action`의 풀 버전(⋯ 메뉴) 대신 이번엔 back 컨트롤만 둔다.
- **본문 표시 `PostBody` fragment 컴포넌트 분리**: 본문·작성 시각·공개 범위 메타라인을 라우트 인라인 마크업에서 `PostBody.svelte`로 추출하고, 기존 스키마의 `Post` 타입 위 `PostBody_post` fragment(`content { bodyText }`, `createdAt`, `visibility`)로 만든다. 단건 조회 query가 없어도 fragment 정의만으로 mearie codegen이 깨지지 않음을 확인했고(orphan fragment 허용), `Post` 타입 기준이라 Storybook 전용이 아닌 실 runtime-safe shape다. 이로써 (1) 백엔드 없이 Storybook(`KOSMO/PostBody`)에서 본문 레이아웃·상태를 리뷰하고, (2) 피드·프로필 목록(PROD-111)에서 재사용한다. 작성자는 여전히 별도 `profileByHandle`이며, PROD-110에서 `post.profile { ...PostAuthorProfile_profile }`로 합류한다.

## Risks / Trade-offs

- **모바일 셸 헤더 중복** → `(tabs)` 셸이 모바일에서 햄버거 헤더를 렌더하므로, 본문 상단 back 컨트롤과 시각적으로 중복될 수 있다. 셸 헤더 통합은 별도 웹 레이아웃 이슈로 이연한다.
- **더미↔실데이터 분기 드리프트** → 더미 단계의 상태 분기가 실제 `createQuery` 필드와 어긋날 위험. 분기 조건을 query 필드명(`loading`/`error`/데이터 null/`state`)에 맞춰 작성하고 주석으로 교체 지점을 표시해 완화한다.
- **스택 의존(PROD-91)** → base 브랜치(prod-91)가 머지·rewrite되면 rebase가 필요하다. 팀 stacked PR 정책(`memory/commit-pr.md`)의 부모 머지 후 rebase 절차를 따른다.

## Migration Plan

데이터 마이그레이션 없음(프론트엔드 표시 기능). 롤백은 라우트 제거로 충분하며 백엔드 영향 없음.

## Open Questions

- 게시글 단건 조회 query의 최종 형태(`post(id:)` 전용 query vs `node(id:)`)는 PROD-93에서 확정된다. 확정되면 PROD-110 서브이슈에서 더미를 교체한다.
- 모바일 `(tabs)` 셸 헤더 + back 헤더 통합, Figma `back_title_action` 풀 헤더(⋯ 메뉴) 적용은 별도 웹 레이아웃/IA 이슈로 이연.
