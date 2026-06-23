## Why

prod-178이 `ProfileHero`와 `SidebarNavigation`의 팔로잉/팔로워 수를 `/@{handle}/following`·`/@{handle}/followers` 웹 라우트로 링크했지만, 해당 라우트가 아직 없어 진입 시 보여줄 화면이 없다. 실제 목록 데이터 연결(PROD-184/185) 전에 두 목록 라우트의 화면 골격(제목·로딩·오류·빈 상태)을 먼저 만들어 진입점을 살린다. (Linear PROD-179, PROD-180)

## What Changes

- `/@{handle}/followers`, `/@{handle}/following` 웹 라우트를 프로필 layout 아래에 추가한다(상단 `ProfileHero` 유지).
- 팔로워/팔로잉 목록 영역의 상태 UI(제목, 로딩 스켈레톤, 인라인 오류 + 재시도, 인라인 빈 상태)를 공유 컴포넌트(`ProfileConnectionList`)로 구성한다.
- 두 라우트는 같은 공유 컴포넌트를 사용해 시각/상태 구조를 일치시킨다.
- 데이터 연결 전 기본 표시는 빈 상태이며, 라우트는 직접 접근해도 깨지지 않는다.

## Dependencies

- 베이스: prod-178(진입점 순서·링크). 본 라우트가 그 링크 대상이다.
- 후속: 실제 followers/following connection 데이터 연결·페이지네이션은 PROD-184/185에서 추가한다. 본 변경은 라우트·상태 골격만 다루며, 로딩/오류 상태 markup은 구성하되 쿼리에 연결하지 않는다(기본 빈 상태).

## Capabilities

### Modified Capabilities

- `web-app-shell`: 팔로워/팔로잉 목록 라우트(ADDED `Followers and following list routes`)와 그 공유 상태 영역(ADDED `Profile connection list area states`) 요구사항을 추가한다.

## Impact

- 신설 `apps/web/src/routes/(tabs)/@[handle]/followers/+page.svelte`
- 신설 `apps/web/src/routes/(tabs)/@[handle]/following/+page.svelte`
- 신설 `apps/web/src/lib/components/ProfileConnectionList.svelte` (+ `ProfileConnectionList.stories.svelte`)
- GraphQL fragment/스키마, API 영향 없음(데이터 연결은 후속 PROD-184/185)

## Out of Scope

- 실제 followers/following connection 데이터 연결·페이지네이션 — PROD-184/185
- ActivityPub followers/following collection 연동
- 팔로우/언팔로우 액션 변경
