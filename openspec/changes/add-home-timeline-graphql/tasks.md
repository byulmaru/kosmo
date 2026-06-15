## 1. 스펙 정렬

- [x] 1.1 `FOLLOWERS` accepted follower 접근 정책을 선행 change(`extend-followers-post-access`)로 분리한다
- [x] 1.2 `post` capability delta spec에 `Query.homeTimeline` 계약을 정리한다

## 2. GraphQL API 구현

- [x] 2.1 `Query.homeTimeline` Relay connection을 추가한다
- [x] 2.2 홈 타임라인 조회에서 내 글과 `ACCEPTED` followee 글만 포함하고 비팔로우·역방향 follower 글을 제외한다
- [x] 2.3 공통 `postVisibilityAccessWhere`를 적용해 노출 가능한 글만 반환한다

## 3. 스키마 및 검증

- [x] 3.1 `apps/api/schema.graphql`을 갱신한다
- [x] 3.2 API 타입체크를 통과시킨다
- [x] 3.3 ESLint, Prettier, OpenSpec 검증을 통과시킨다
- [ ] 3.4 로컬 DB 시드 기반 GraphQL 수동 시나리오를 확인한다
