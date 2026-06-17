## Why

PR #124(PROD-151) 리뷰에서 robin은 홈 페이지가 `homeTimeline`을 별도 쿼리·컴포넌트로 분리하지 말고 페이지 쿼리 하나에 fragment로 합치라고 요청했다. 그러나 현재 `Query.homeTimeline`은 active profile이 없으면 GraphQL active profile 인증 scope로 요청을 거부(에러)하므로, 프로필 없는 사용자도 실행하게 되는 페이지 쿼리에 합칠 수 없어 분리가 강제됐다. 거부 대신 `null`을 반환하게 하면 이 제약이 사라진다.

## What Changes

- `Query.homeTimeline`을 인증되지 않았거나 active profile이 없는 클라이언트가 조회할 때, GraphQL 인증 scope로 거부하는 대신 `null`을 반환하도록 변경한다. (`me`, `currentSession` query와 동일한 nullable + `unauthorizedResolver` 패턴)
- 결과적으로 `homeTimeline` 스키마 필드가 non-null(`HomeTimelineConnection!`)에서 nullable(`HomeTimelineConnection`)로 바뀐다. **BREAKING**: 스키마 nullability 변경(현재 유일한 소비자인 web 클라이언트는 이미 null을 처리한다).
- (구현 정리) 홈 페이지가 `homeTimeline`을 `HomePageQuery`에 fragment로 합치고, 별도 `HomeTimeline.svelte` 분리를 제거한다. 웹 동작 계약(홈에서 타임라인 표시) 자체는 그대로이므로 spec 변경은 `post` capability에 한정한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: `Query.homeTimeline`의 "active profile 없는 조회" 동작을 "인증 scope로 거부"에서 "`null` 반환"으로 변경한다.

## Impact

- 영향 코드(apps/api): `apps/api/src/graphql/resolvers/post/query/home-timeline.ts`(nullable + `unauthorizedResolver`), 재생성된 `apps/api/schema.graphql`.
- 영향 코드(apps/web): `apps/web/src/routes/(tabs)/home/+page.svelte`(`homeTimeline`을 `HomePageQuery`에 통합), `apps/web/src/routes/(tabs)/home/HomeTimeline.svelte` 제거.
- 영향 스펙: `post` capability의 "Home timeline connection" 요구사항.
- 구현은 PR #124에서 이미 완료됨 — 본 변경은 spec과 코드를 정렬하는 백필 성격이다.
