## 1. 서버 리졸버

- [x] 1.1 `apps/api/src/graphql/resolvers/post/query/home-timeline.ts`의 connection field options에 `nullable: true`와 `unauthorizedResolver: () => null` 추가 (`withAuth({ usingProfile: true })`는 유지)
- [x] 1.2 dev로 `apps/api/schema.graphql` 재생성 — `homeTimeline(...): HomeTimelineConnection`(non-null `!` 제거) 확인

## 2. 웹 프론트엔드

- [x] 2.1 `home/+page.svelte`의 `HomePageQuery`에 `homeTimeline(first: 20) { ...PostList_homeTimeline }` 추가, `homeTimeline` 파생값 추가
- [x] 2.2 `selectedProfile` 분기를 헤더 + `<PostList>` 인라인 렌더로 교체하고 `PostList` import 추가
- [x] 2.3 `home/HomeTimeline.svelte` 제거 및 import 정리
- [x] 2.4 web `$mearie` 타입 재생성으로 `query.data.homeTimeline`이 nullable로 타이핑되는지 확인

## 3. 검증

- [x] 3.1 `pnpm --filter @kosmo/api lint:tsc` 통과 (`unauthorizedResolver` × connection 타입 확인)
- [x] 3.2 `pnpm --filter @kosmo/web check` 통과 (0 errors)
- [x] 3.3 `pnpm lint:eslint`, `pnpm lint:prettier` 통과
- [ ] 3.4 수동 확인: 프로필 미선택 로그인 사용자가 홈 진입 시 `homeTimeline` GraphQL 오류 없이 온보딩 노출
