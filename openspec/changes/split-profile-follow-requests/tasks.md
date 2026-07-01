## 1. Core schema

- [x] 1.1 core enum에서 `ProfileFollowState`를 제거한다.
- [x] 1.2 `ProfileFollows`에서 `state`와 `respondedAt` 컬럼/인덱스를 제거하고 follow 관계용 인덱스를 정리한다.
- [x] 1.3 `ProfileFollowRequests` 테이블, table discriminator, Drizzle relations를 추가한다.
- [x] 1.4 관련 memory 문서에서 profile follow/request 저장 책임을 갱신한다.

## 2. API behavior

- [x] 2.1 `ProfileFollow` GraphQL 타입과 enum 등록에서 follow state 노출을 제거한다.
- [x] 2.2 follow graph loader, followers/following connection, count resolver를 follow row 존재 기준으로 수정한다.
- [x] 2.3 `followProfile` mutation을 기존 follow 멱등 반환, `OPEN` 대상 생성, `APPROVAL_REQUIRED` 대상 conflict 정책에 맞게 수정한다.
- [x] 2.4 post visibility와 home timeline 조건에서 accepted state 필터를 제거한다.

## 3. Web client

- [x] 3.1 FollowButton fragment와 mutations에서 `ProfileFollow.state` 선택을 제거한다.
- [x] 3.2 FollowButton 상태 계산과 문구를 binary follow 모델로 정리한다.
- [x] 3.3 ProfileListItem/ProfileConnectionList/Search Storybook mock에서 pending/rejected follow state를 제거한다.

## 4. Generated schema and validation

- [x] 4.1 `apps/api/schema.graphql`을 재생성한다.
- [x] 4.2 OpenSpec 변경 산출물을 검증한다.
- [x] 4.3 관련 TypeScript/Svelte 타입체크와 포맷 검사를 실행한다.
