## Why

프론트엔드 홈 화면이 선택 프로필 기준 홈 타임라인을 GraphQL로 조회할 수 있어야 한다. 이번 사이클에서는 Redis fanout 없이 DB 직접 조회로 첫 페이지를 제공하고, followee의 `FOLLOWERS` 글 접근에 필요한 최소 정책을 함께 정렬한다.

## What Changes

- `Query.homeTimeline` Relay connection을 추가해 현재 active profile의 글과 `ACCEPTED` followee의 글을 최신순으로 반환한다.
- 현재 active profile이 작성자를 `ACCEPTED` 상태로 팔로우 중이면 작성자의 `FOLLOWERS` 공개 범위 글을 조회할 수 있도록 공통 `Post` 접근 정책을 확장한다.
- `homeTimeline` 전용 예외가 아니라 `Post` Node 로딩과 기존 `Profile.posts` 목록 조회에도 같은 접근 정책이 적용되게 한다.
- `DIRECT`, 삭제됨, 숨김/블라인드, 접근 불가 에러 UI 계약, Redis 저장소, fanout, 운영용 백필은 이번 변경 범위에서 제외한다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: 홈 타임라인 GraphQL connection과 `FOLLOWERS` 공개 범위의 accepted follower 접근 정책을 추가한다.

## Impact

- 영향 코드(apps/api): `postVisibilityAccessWhere` 접근 정책, `post/query/home-timeline.ts`, GraphQL schema 산출물.
- 영향 스펙: `post` capability의 `Post` object visibility, `Profile.posts`, 신규 `Query.homeTimeline` 계약.
- 프론트엔드 홈 타임라인 데이터 연결 이슈가 바로 사용할 수 있는 `Post` connection shape를 제공한다.
