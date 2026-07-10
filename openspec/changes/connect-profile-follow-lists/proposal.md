## Why

팔로워·팔로잉 목록 라우트는 골격만 있어 진입점 링크가 실제 목록 대신 빈 상태로 끝난다. 이미 API가 `Profile.followers`와 `Profile.following` connection을 제공하므로, 후속 PROD-184/185에서 각 라우트를 첫 페이지 데이터에 연결해 사용자가 관계 목록을 확인할 수 있게 한다.

## What Changes

- `/@{handle}/followers` 라우트에서 `Profile.followers(first: 20)` 첫 페이지를 조회하고, 각 edge의 `node.follower` 프로필을 `ProfileListItem`으로 렌더한다.
- `/@{handle}/following` 라우트에서 `Profile.following(first: 20)` 첫 페이지를 조회하고, 각 edge의 `node.followee` 프로필을 `ProfileListItem`으로 렌더한다.
- 두 목록은 connection이 반환한 edge 순서를 그대로 렌더하며 클라이언트에서 별도 정렬하지 않는다.
- `ProfileConnectionList`는 기존 로딩·오류·빈 상태를 유지하면서, 데이터가 있을 때 프로필 목록을 표시할 수 있게 확장한다.
- 이번 변경은 첫 페이지 렌더링만 다루며 pagination, 새 follow/unfollow mutation, `FollowButton` 책임 경계 재정리, active profile 전환 시 목록 viewer 상태 재동기화, 서버 GraphQL connection 변경은 포함하지 않는다.

## Capabilities

### New Capabilities

- 없음

### Modified Capabilities

- `web-app-shell`: 팔로워·팔로잉 목록 라우트가 GraphQL connection 첫 페이지를 조회해 `ProfileListItem` 목록으로 렌더해야 한다는 요구사항을 추가한다.

## Impact

- `apps/app/src/app/(tabs)/(profile)/[profileHandle]/followers.tsx`
- `apps/app/src/app/(tabs)/(profile)/[profileHandle]/following.tsx`
- `apps/app/src/components/profile/ProfileConnectionList.tsx`
- `apps/app` React Native Web Storybook의 `ProfileConnectionList` state stories
- API schema 변경 없음: 기존 `Profile.followers`/`Profile.following` Relay connection과 `ProfileFollow.follower`/`ProfileFollow.followee` 필드를 사용한다.
