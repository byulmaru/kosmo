## Why

`profile_follow`가 실제 팔로잉 관계와 승인 대기/거절 요청 상태를 동시에 표현하고 있어 조회, 카운트, 타임라인 접근 정책이 모두 `ACCEPTED` 상태 필터에 의존한다. 팔로우 관계는 이미 성립한 관계만 나타내고, 승인 흐름은 별도 요청 테이블로 분리해 도메인 경계를 명확히 한다.

## What Changes

- **BREAKING** `ProfileFollow`는 더 이상 `state`를 갖지 않고, 존재 자체가 팔로잉 관계를 의미한다.
- `profile_follow` 테이블에서 `state`와 `responded_at` 책임을 제거한다.
- `profile_follow_request` 테이블을 추가해 대기 중인 요청의 follower/followee 방향과 생성 시각을 저장할 수 있게 한다.
- 기존 follow graph, followers/following count, followers-only post visibility, home timeline 조건을 `ACCEPTED` 상태 대신 `profile_follow` row 존재 여부로 판단한다.
- 공개 GraphQL 팔로우 요청 mutation/query는 이번 범위에서 열지 않는다. 요청 생성/승인/거절 로직은 후속 변경에서 정의한다.

## Capabilities

### New Capabilities

- 없음

### Modified Capabilities

- `data-model`: `profile_follow`를 팔로잉 관계 전용 테이블로 바꾸고 `profile_follow_request` 저장 모델을 추가한다.
- `profile`: GraphQL `ProfileFollow`와 follow graph 요구사항에서 상태 기반 표현을 제거한다.
- `post`: 팔로워 공개 게시글과 홈 타임라인 접근 조건을 accepted 상태가 아닌 팔로우 관계 존재 여부로 바꾼다.
- `api-platform`: GraphQL enum 등록 대상에서 더 이상 노출되지 않는 `ProfileFollowState`를 제거한다.

## Impact

- `packages/core`: enum, Drizzle table, relations, table discriminator, DB 접근 타입.
- `apps/api`: GraphQL enum 등록, `ProfileFollow` ref/loader/field, follow/unfollow mutation, post visibility, home timeline, generated schema.
- `apps/web`: `ProfileFollow.state`를 선택하던 fragments, FollowButton UI 상태, Storybook mock.
- OpenSpec: `data-model`, `profile`, `post`, `api-platform` delta.
