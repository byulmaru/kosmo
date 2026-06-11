## Context

PROD-89(게시글 디테일 페이지)는 단건 조회 query(PROD-93)와 작성자 표시 컴포넌트(PROD-97)에 블로킹돼 있다. PR #67(PROD-92)이 `Post`/`PostContent` 타입과 `createPost` mutation을 추가했지만 단건 조회 query는 없고, `PostAuthorProfile`(PR #72)은 아직 머지 전이다. 그래서 블로커와 독립적인 라우트·UI·상태 처리만 더미 데이터로 먼저 구현한다. 순수 프론트엔드(`apps/web`, SvelteKit + mearie GraphQL + Tailwind 시맨틱 토큰)이며, 디자인 기준은 Figma `🧵 Post Detail` 섹션의 anchor 포스트다. 이 변경은 PROD-91의 `(tabs)/@[handle]` 라우트 위에 스택한다.

## Goals / Non-Goals

**Goals:**

- 게시글 URL(`/@{handle}/{postId}`)로 단일 게시글 디테일에 직접 접근한다.
- 작성자 프로필 헤더(`ProfileHero`)가 아니라 단독 게시글 뷰로 렌더한다.
- Plain Text 본문·작성자·작성 시각을 표시하고, 로딩/오류/없는 게시글/삭제됨 상태가 깨지지 않게 한다.
- 더미→실데이터 교체 비용이 작도록, 더미를 한 곳에 모으고 상태 분기를 query 필드와 1:1 매핑되게 작성한다.

**Non-Goals:**

- 답글·반응·리포스트·ReplyComposer(Figma 풀 스레드 뷰).
- 실제 `post` 조회 query 연결(PROD-93)·`PostAuthorProfile` 연결(PROD-97) — 같은 브랜치 후속.
- 모바일 `(tabs)` 셸 헤더와 back 헤더 통합 — 별도 웹 레이아웃 이슈.

## Decisions

- **URL `/@{handle}/{postId}` (프로필 라우트 하위)**: 대안으로 `/posts/{postId}`(핸들 비의존 평면 경로)를 검토했으나, 작성자 핸들이 URL에 드러나고 프로필 라우트와 일관된 Mastodon식 `/@{handle}/{postId}`를 채택했다.
- **`+page@(tabs).svelte`로 레이아웃 리셋**: `@[handle]/+layout.svelte`는 모든 하위 라우트에 작성자 `ProfileHero`를 강제로 렌더한다. 게시글 디테일은 단독 뷰여야 하므로 `@(tabs)` 세그먼트로 레이아웃을 `(tabs)` 셸까지 리셋해 ProfileHero를 건너뛰되, 사이드바·하단탭 셸은 유지한다.
- **로컬 더미 상수**: 이 레포는 loader 파일 없이 컴포넌트 내 인라인 `createQuery`를 쓴다. 그러나 `post` 조회 query가 스키마에 없어 진짜 query를 쓰면 mearie codegen이 깨진다. 따라서 PR #67의 `Post`/`PostContent` shape에 맞춘 로컬 타입·상수를 한 곳에 두고, 상태 분기(`loading`/`error`/null/`state`)는 PROD-93 머지 후 `createQuery` 필드로 1:1 교체되도록 구성한다.
- **작성자 placeholder**: `PostAuthorProfile`(PR #72)이 머지 전이므로, PROD-91의 `getProfileInitial` 기반 이니셜 아바타 + 표시 이름 + `@handle`로 placeholder를 만들고 `/@{handle}`로 링크한다. PROD-97 머지 후 같은 브랜치에서 컴포넌트로 교체한다.
- **back 헤더 최소화**: Figma `back_title_action`의 풀 버전(⋯ 메뉴) 대신 이번엔 back 컨트롤만 둔다.

## Risks / Trade-offs

- **모바일 셸 헤더 중복** → `(tabs)` 셸이 모바일에서 햄버거 헤더를 렌더하므로, 본문 상단 back 컨트롤과 시각적으로 중복될 수 있다. 셸 헤더 통합은 별도 웹 레이아웃 이슈로 이연한다.
- **더미↔실데이터 분기 드리프트** → 더미 단계의 상태 분기가 실제 `createQuery` 필드와 어긋날 위험. 분기 조건을 query 필드명(`loading`/`error`/데이터 null/`state`)에 맞춰 작성하고 주석으로 교체 지점을 표시해 완화한다.
- **스택 의존(PROD-91)** → base 브랜치(prod-91)가 머지·rewrite되면 rebase가 필요하다. 팀 stacked PR 정책(`memory/commit-pr.md`)의 부모 머지 후 rebase 절차를 따른다.

## Migration Plan

데이터 마이그레이션 없음(프론트엔드 표시 기능). 롤백은 라우트 제거로 충분하며 백엔드 영향 없음.

## Open Questions

- 게시글 단건 조회 query의 최종 형태(`post(id:)` 전용 query vs `node(id:)`)는 PROD-93에서 확정된다. 확정되면 같은 브랜치에서 더미를 교체한다.
- 모바일 `(tabs)` 셸 헤더 + back 헤더 통합, Figma `back_title_action` 풀 헤더(⋯ 메뉴) 적용은 별도 웹 레이아웃/IA 이슈로 이연.
