## Why

PROD-92에서 게시글 작성 mutation과 `Post`/`PostContent` GraphQL Node 타입을 추가했지만, 작성된 게시글을 다시 조회하는 query는 아직 없다. 프로필 게시글 목록(PROD-88)과 게시글 디테일 페이지(PROD-89)가 같은 조회 기반을 필요로 하므로, 게시글 조회 GraphQL query를 백엔드 작업으로 먼저 추가한다.

## What Changes

- ID로 단일 활성 게시글을 조회하는 `post(id: ID!): Post` query를 추가한다.
- 프로필이 작성한 활성 게시글을 최신순으로 페이지네이션하는 `Profile.posts` Relay connection을 추가한다.
- 없는 게시글, 비활성(`ACTIVE`가 아닌) 게시글, 비활성 프로필 게시글은 조회 결과에서 제외한다.
- 게시글이 없는 프로필은 빈 connection을 반환한다.
- viewer 기준 공개 범위 접근 제어(`FOLLOWERS`/`DIRECT` 제한, `UNLISTED` 목록 제외)는 이번 변경 범위에서 제외하고 `PROD-102`로 미룬다. 목록은 `state=ACTIVE` 게시글을 공개 범위와 무관하게 노출한다.

## Capabilities

### Modified Capabilities

- `post`: 작성된 게시글을 조회하는 단건 query와 프로필별 게시글 목록 connection 계약을 추가한다.

## Impact

- `apps/api/src/graphql/resolvers/post/query`: 단건 게시글 조회 query 추가
- `apps/api/src/graphql/resolvers/post/field`: `Profile.posts` connection 필드 추가
- `apps/api/schema.graphql`: `post` query, `Profile.posts` connection, `PostConnection`/`PostEdge` 타입 반영
