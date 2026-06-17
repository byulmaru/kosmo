## Context

`Query.homeTimeline`(`apps/api/src/graphql/resolvers/post/query/home-timeline.ts`)은 `t.withAuth({ usingProfile: true })`로 정의돼, active profile이 없으면 GraphQL 인증 scope가 요청을 거부(에러)한다. 이 때문에 web 홈은 프로필이 선택됐을 때만 마운트되는 별도 컴포넌트(`HomeTimeline.svelte`)에서 `homeTimeline`을 따로 조회해야 했고, 페이지 쿼리(`HomePageQuery`)와 분리됐다. PR #124 리뷰에서 robin이 이 분리 구조와 인증 실패 동작을 지적했다.

같은 코드베이스의 `me`, `currentSession` query는 이미 인증 실패 시 거부 대신 `null`을 반환하는 패턴(`nullable: true` + `unauthorizedResolver: () => null`)을 쓴다.

## Goals / Non-Goals

**Goals:**

- `homeTimeline`을 인증/active profile 부재 시 거부 대신 `null` 반환으로 바꿔, 페이지 쿼리에 안전하게 합칠 수 있게 한다.
- 코드베이스 기존 패턴(`me`/`currentSession`)과 일관성을 유지한다.

**Non-Goals:**

- active profile이 있는 사용자의 타임라인 가시성 정책(팔로우 관계·공개 범위)은 변경하지 않는다.
- Codex 봇이 지적한 "프로필 전환 시 이전 타임라인 캐시 잔존"(P2)은 본 변경 범위 밖이다.

## Decisions

### 결정: `withAuth` 유지 + `nullable: true` + `unauthorizedResolver: () => null`

- field options에 `nullable: true`와 `unauthorizedResolver: () => null`을 추가한다. `withAuth({ usingProfile: true })`는 그대로 유지하므로 `resolve` 본문은 변경 없이 `ctx.session.profileId`를 보장받는다.
- **대안: `withAuth` 제거 후 `resolve` 안에서 `ctx.session?.profileId` 직접 체크** — 더 유연하나 타입 안정성을 잃고 `me`/`currentSession` 관습과 어긋나므로 채택하지 않음.

### 결정: 스키마 필드를 nullable로

- `homeTimeline: HomeTimelineConnection!` → `HomeTimelineConnection`. `apps/api/src/graphql/schema.ts`가 dev에서 자동 재생성하며, web `mearie.config.ts`가 이 스키마를 읽어 `$mearie` 타입을 갱신한다.

### 결정: 프론트는 페이지 쿼리에 통합

- `HomePageQuery`에 `homeTimeline(first: 20) { ...PostList_homeTimeline }`를 추가하고 결과를 `<PostList>`에 fragment ref로 넘긴다. 프로필 페이지(`@[handle]/+page.svelte`)가 `PostList_profile`를 쓰는 관습과 동일. `HomeTimeline.svelte`는 제거한다.

## Risks / Trade-offs

- [스키마 nullability 완화(non-null → nullable)는 GraphQL 상 breaking] → 현재 유일 소비자(web)가 이미 `?? null`로 처리하므로 실질 영향 없음. 신규 클라이언트는 nullable을 전제로 작성한다.
- [프로필 없는 사용자도 페이지 쿼리에서 `homeTimeline`을 요청] → 거부 대신 `null`이라 오류 응답·에러 로그가 발생하지 않으며, 데이터는 노출되지 않는다(`null`).
