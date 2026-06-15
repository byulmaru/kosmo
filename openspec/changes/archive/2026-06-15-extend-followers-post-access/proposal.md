## Why

홈 타임라인과 프로필 게시글 목록에서 accepted follower가 followee의 `FOLLOWERS` 공개 범위 글을 볼 수 있어야 한다. 이 정책을 개별 query 예외로 두면 `Post` Node 조회와 목록 조회가 서로 어긋날 수 있으므로 공통 게시글 접근 정책으로 먼저 정렬한다.

## What Changes

- 현재 active profile이 작성자를 `ACCEPTED` 상태로 팔로우 중이면 작성자의 `FOLLOWERS` 공개 범위 글을 조회할 수 있게 한다.
- 이 접근 정책을 `Post` Node 로딩과 `Profile.posts` 목록 조회에 공통 적용한다.
- `DIRECT`, 삭제됨, 숨김/블라인드, 접근 불가 에러 UI 계약은 이번 변경 범위에서 제외한다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: `FOLLOWERS` 공개 범위의 accepted follower 접근 정책을 추가한다.

## Impact

- 영향 코드(apps/api): `postVisibilityAccessWhere` 접근 정책.
- 영향 스펙: `post` capability의 `Post` object visibility와 `Profile.posts` 목록 조회 계약.
- 후속 홈 타임라인 GraphQL 조회 구현이 같은 visibility 정책을 재사용할 수 있다.
