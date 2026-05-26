# 팔로우 GraphQL 기능 구현

## 배경

`profile_follow` 테이블과 `ProfileFollow` GraphQL 타입은 이미 존재하지만, 프로필 간 팔로우를 생성/해제하거나 팔로워/팔로잉 목록을 GraphQL API에서 조회할 수 없다.

## 변경 범위

- `Profile`에 팔로워/팔로잉 connection, count, viewer 기준 follow 상태 필드를 추가한다.
- 팔로워/팔로잉 connection과 count는 accepted 관계 중 상대 프로필도 활성 상태인 관계만 노출한다.
- 팔로워/팔로잉 connection의 node는 프로필 자체가 아니라 `ProfileFollow` 관계이다.
- `ProfileFollow`에 `follower`, `followee` 관계 필드를 추가한다.
- `followProfile`, `unfollowProfile` mutation을 추가한다.
- follow actor는 현재 세션의 active profile을 사용한다.
- 이번 변경에서는 공개 팔로우만 구현하고 pending 승인/거절 플로우는 만들지 않는다.

## 비목표

- pending follow 생성, 승인, 거절 mutation 구현
- 기존에 `PENDING` 또는 `REJECTED` 상태인 follow 관계가 있을 때의 재요청 정책 정의
- 알림, 차단/뮤트, federation 연동
- DB schema 변경

## 검증

- active profile이 있는 세션에서 대상 프로필을 follow/unfollow할 수 있다.
- 이미 `ACCEPTED` 상태인 관계에 대한 중복 follow와 없는 관계 unfollow는 멱등 성공으로 처리된다.
- 자기 자신 follow는 `ConflictError`를 반환한다.
- followers/following connection과 count는 accepted 관계 기준으로 동작한다.

## 남은 결정

- pending 승인 플로우가 추가될 때 `PENDING` 또는 `REJECTED` 상태의 기존 follow 관계에 `followProfile`을 다시 호출하면 기존 관계를 반환할지, `ACCEPTED`로 전환할지, 별도 오류로 처리할지 결정한다.

## 남은 리스크

- followers/following connection은 현재 offset 기반 cursor를 사용하므로, 페이지 조회 중 관계가 추가되거나 삭제되면 같은 cursor가 다른 위치를 가리킬 수 있다.
- followersCount, followingCount, viewerFollowState는 프로필별 개별 쿼리를 수행하므로 여러 프로필을 한 번에 조회하는 쿼리에서는 N+1이 발생할 수 있다.
