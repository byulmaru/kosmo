## Why

팔로워/팔로잉 목록은 이미 GraphQL connection 첫 페이지를 표시하지만, 관계 수가 20개를 넘으면 사용자가 나머지 목록을 탐색할 수 없다. API가 cursor pagination과 `pageInfo`를 제공하므로, 웹 목록 화면이 다음 페이지 로드를 연결해 긴 관계 목록을 끝까지 볼 수 있게 한다.

## What Changes

- `/@{handle}/followers`와 `/@{handle}/following` 목록에서 `pageInfo.hasNextPage`와 `pageInfo.endCursor`를 사용해 다음 페이지를 불러온다.
- 두 목록은 같은 pagination UI와 상태 처리를 공유한다.
- 다음 페이지 로딩 중에는 중복 클릭을 막고 진행 중 상태를 표시한다.
- 마지막 페이지에서는 추가 로드 동작을 노출하지 않는다.
- 다음 페이지 조회가 실패하면 기존 목록은 유지하고, 같은 위치에서 재시도할 수 있게 한다.
- 이 변경은 follow/unfollow mutation, active profile 전환 재동기화, `FollowButton` 책임 재설계, 서버 GraphQL connection 계약 변경을 포함하지 않는다.

## Capabilities

### New Capabilities

- 없음

### Modified Capabilities

- `web-app-shell`: 팔로워/팔로잉 목록 라우트가 connection 첫 페이지뿐 아니라 `pageInfo` 기반 다음 페이지 로드를 제공해야 한다는 요구사항을 추가한다.

## Impact

- `openspec/specs/web-app-shell/spec.md`
- `apps/web/src/routes/(tabs)/@[handle]/followers/+page.svelte`
- `apps/web/src/routes/(tabs)/@[handle]/following/+page.svelte`
- `apps/web/src/lib/components/ProfileConnectionList.svelte`
- `apps/web/src/lib/components/ProfileConnectionList.stories.svelte`
- API schema/resolver 변경 없음: 기존 `Profile.followers(after:, first:)`, `Profile.following(after:, first:)`, `PageInfo` 계약을 사용한다.
