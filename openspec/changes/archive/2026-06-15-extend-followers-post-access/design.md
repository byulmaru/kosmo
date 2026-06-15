## Context

현재 게시글 접근 정책은 `PUBLIC`, `UNLISTED`, 작성자 본인 글만 노출한다. `FOLLOWERS` 글은 작성자의 팔로워에게 보여야 하지만, 현재 공통 `postVisibilityAccessWhere`에서 follow 관계를 확인하지 않아 `Post` Node 로딩과 `Profile.posts`에서 accepted follower가 접근할 수 없다.

## Goals / Non-Goals

**Goals:**

- accepted follower가 followee의 `FOLLOWERS` 글을 조회할 수 있게 한다.
- `Post` Node 로딩과 `Profile.posts`가 같은 visibility 정책을 공유하게 한다.
- 후속 `Query.homeTimeline` 구현이 별도 예외 없이 공통 접근 정책을 재사용할 수 있게 한다.

**Non-Goals:**

- `Query.homeTimeline` 필드 추가는 후속 PR에서 처리한다.
- `DIRECT` 수신자 정책, 삭제/숨김/블라인드 상태별 에러 계약은 처리하지 않는다.
- Redis fanout, 타임라인 저장 테이블, 운영용 백필을 만들지 않는다.

## Decisions

- `postVisibilityAccessWhere`를 `EXISTS profile_follow` 조건으로 확장한다. 호출부마다 follow join을 추가하지 않고 기존 `Post` Node 로딩과 `Profile.posts` 쿼리가 같은 정책을 유지할 수 있기 때문이다.
- accepted follower 조건은 `Posts.visibility = FOLLOWERS`, `ProfileFollows.followerProfileId = viewer`, `ProfileFollows.followeeProfileId = Posts.profileId`, `ProfileFollows.state = ACCEPTED`를 모두 만족해야 한다.
- `DIRECT`는 수신자 모델이 없으므로 이번 변경에서 계속 작성자 본인에게만 노출한다.

## Risks / Trade-offs

- [Risk] `EXISTS` 조건은 게시글 조회 비용을 늘릴 수 있다. → 현재 범위는 첫 타임라인 구현 전 공통 정책 정렬이며, `profile_follow`에는 follower/state 인덱스가 있다.
- [Risk] `DIRECT`를 같이 확장하면 의도치 않은 노출이 생길 수 있다. → 수신자 정책이 정해질 때까지 PROD-121로 남긴다.
