## 1. 스펙 정렬

- [x] 1.1 PROD-147 범위에 홈 타임라인과 `FOLLOWERS` accepted follower 접근 정책을 반영한다
- [x] 1.2 PROD-121 범위에서 홈 타임라인 첫 구현에 필요한 `FOLLOWERS` 최소 정책을 분리한다
- [x] 1.3 `post` capability delta spec에 `Query.homeTimeline`, `Post` 접근 정책, `Profile.posts` 접근 정책을 정리한다

## 2. GraphQL API 구현

- [x] 2.1 `postVisibilityAccessWhere`에 accepted follower의 `FOLLOWERS` 글 접근 조건을 추가한다
- [x] 2.2 `Query.homeTimeline` Relay connection을 추가한다
- [x] 2.3 홈 타임라인 조회에서 내 글과 `ACCEPTED` followee 글만 포함하고 비팔로우·역방향 follower 글을 제외한다
- [x] 2.4 `Post` Node 로딩, `Profile.posts`, `homeTimeline`이 같은 visibility 정책을 공유하게 한다

## 3. 스키마 및 검증

- [x] 3.1 `apps/api/schema.graphql`을 갱신한다
- [x] 3.2 API 타입체크를 통과시킨다
- [x] 3.3 ESLint, Prettier, OpenSpec 검증을 통과시킨다
- [ ] 3.4 로컬 DB 시드 기반 GraphQL 수동 시나리오를 확인한다
