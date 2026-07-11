## Context

팔로워·팔로잉 목록 라우트와 `ProfileConnectionList` 상태 골격은 이미 존재하지만, 두 라우트는 아직 GraphQL 데이터를 조회하지 않아 항상 빈 상태를 표시한다. API는 기존 `Profile.followers`/`Profile.following` connection과 `ProfileFollow.follower`/`ProfileFollow.followee` 필드를 제공하므로 서버 스키마나 resolver를 바꾸지 않고 웹 라우트만 데이터에 연결할 수 있다.

## Goals / Non-Goals

**Goals:**

- `/@{handle}/followers`에서 `Profile.followers(first: 20)` 첫 페이지를 조회해 follower 프로필 목록을 렌더한다.
- `/@{handle}/following`에서 `Profile.following(first: 20)` 첫 페이지를 조회해 followee 프로필 목록을 렌더한다.
- 목록 항목은 기존 `ProfileListItem`과 `FollowButton` 정책을 재사용한다.
- 로딩·오류·빈 상태는 기존 `ProfileConnectionList` 골격을 유지한다.

**Non-Goals:**

- pagination 또는 추가 페이지 로딩.
- follow/unfollow mutation 추가나 `FollowButton` 책임 경계 변경.
- active profile 전환 시 이미 렌더된 목록의 viewer 상태 재동기화.
- API GraphQL connection, resolver, schema 변경.

## Decisions

- `ProfileConnectionList`가 `followersProfile`/`followingProfile` fragment prop을 받아 connection을 읽는다.
  - 이유: `PostList`처럼 query는 route에 colocate하고, 목록 컴포넌트가 자신이 필요한 fragment와 항목 렌더링 책임을 가진다.
  - 대안: route에서 edge 배열을 직접 풀어 scalar props로 넘길 수 있지만, `ProfileListItem_profile` fragment 계약을 route에 중복시키게 된다.
- 두 route page는 각각 `ProfileFollowersPageQuery`와 `ProfileFollowingPageQuery`를 둔다.
  - 이유: PROD-184와 PROD-185를 별도 구현 PR로 나눌 수 있고, 각 route가 필요한 connection만 조회한다.
  - 대안: 하나의 공용 route helper나 query document로 묶을 수 있지만, Svelte route별 colocation과 stacked PR 분리가 흐려진다.
- 첫 페이지는 `first: 20`으로 고정한다.
  - 이유: 사용자 확인 범위가 첫 페이지 렌더링이고, pagination은 PROD-188로 분리되어 있다.
- `ProfileListItem`에는 connection node의 상대 프로필(`followers.node.follower`, `following.node.followee`)을 넘긴다.
  - 이유: API connection edge의 node는 `ProfileFollow`이므로 실제 목록에 표시할 프로필은 관계의 follower/followee 필드다.
- 목록 항목은 connection edge가 반환된 순서를 그대로 사용하고 클라이언트에서 별도 정렬하지 않는다.
  - 이유: 정렬 기준은 API connection 계약의 책임이다. 이번 변경은 기존 connection 첫 페이지를 화면에 연결하는 것이며, 웹에서 별도 정렬하면 향후 pagination과 서버 cursor 순서가 어긋날 수 있다.
- `viewerProfileId`는 profile layout에서 쓰는 `currentSession.selectedProfile.id`와 같은 query shape로 route page에서 조회해 `ProfileListItem`에 전달한다.
  - 이유: `ProfileListItem`/`FollowButton`의 기존 표시 정책을 유지한다. 비로그인 또는 선택 프로필 없음은 `viewerProfileId=null`로 처리한다.

## Risks / Trade-offs

- **첫 페이지만 렌더링해 목록이 잘릴 수 있음** → pagination은 PROD-188에서 별도 UI/connection 정책으로 추가한다.
- **active profile 전환 후 목록 항목의 follow button viewer 상태가 즉시 재동기화되지 않을 수 있음** → 기존 `ProfileListItem` 정책을 유지하고, 재동기화는 PROD-189에서 다룬다.
- **두 route query가 유사해 중복이 생김** → 이번 stack에서는 PROD-184/185를 독립 PR로 유지하는 이점이 더 크다.
