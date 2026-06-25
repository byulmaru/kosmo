## 1. 공유 목록 컴포넌트

- [ ] 1.1 `ProfileConnectionList.svelte`가 `Profile.followers(first: 20)`/`Profile.following(first: 20)` fragment prop을 받아 각 edge의 상대 프로필을 `ProfileListItem`으로 렌더하도록 확장한다
- [ ] 1.2 `viewerProfileId`를 `ProfileListItem`에 전달해 기존 `FollowButton` 표시 정책을 유지한다
- [ ] 1.3 로딩·오류·빈 상태는 기존 표시 구조를 유지하고, connection 데이터가 있을 때만 항목 목록을 표시한다
- [ ] 1.4 Storybook에 실제 항목이 있는 followers/following 상태를 추가한다

## 2. 팔로워 목록 데이터 연결 (PROD-184)

- [ ] 2.1 `/@{handle}/followers` route query에서 `profileByHandle(handle:)`와 `Profile.followers(first: 20).edges[].node.follower`를 조회한다
- [ ] 2.2 같은 query에서 `currentSession.selectedProfile.id`를 조회해 `viewerProfileId`로 전달한다
- [ ] 2.3 followers route가 `ProfileConnectionList kind="followers"`에 profile data, loading, error, retry를 연결한다

## 3. 팔로잉 목록 데이터 연결 (PROD-185)

- [ ] 3.1 `/@{handle}/following` route query에서 `profileByHandle(handle:)`와 `Profile.following(first: 20).edges[].node.followee`를 조회한다
- [ ] 3.2 같은 query에서 `currentSession.selectedProfile.id`를 조회해 `viewerProfileId`로 전달한다
- [ ] 3.3 following route가 `ProfileConnectionList kind="following"`에 profile data, loading, error, retry를 연결한다

## 4. 검증

- [ ] 4.1 `pnpm -F @kosmo/web check`를 통과시킨다
- [ ] 4.2 `pnpm lint:prettier`를 통과시킨다
- [ ] 4.3 followers/following 목록에서 실제 항목 표시, 빈 상태, connection edge 순서 보존(클라이언트 재정렬 없음), 비로그인/선택 프로필 없음/본인 프로필 follow action 정책을 수동 확인한다
