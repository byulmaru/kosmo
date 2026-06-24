## Why

프로필 헤더(`ProfileHero`)와 사이드바(`SidebarNavigation`)의 팔로잉/팔로워 수에서 해당 목록으로 가는 진입점이 없다. 팔로잉/팔로워 목록 라우트 골격(`/@{handle}/following`·`/@{handle}/followers`)이 추가된 뒤, 각 카운트를 그 목록 라우트로 이동하는 링크로 만든다. (Linear PROD-217)

## What Changes

- `ProfileHero`와 사이드바 활성 프로필 영역의 팔로잉/팔로워 수를 각각 `/@{handle}/following`, `/@{handle}/followers` 웹 라우트 링크로 만든다.
- 각 카운트의 클릭 영역은 숫자와 라벨 텍스트를 모두 포함한다(트위터/블루스카이/마스토돈 방식).
- 사이드바 카운트 링크가 모바일 drawer 안에서 렌더될 때는, 기존 drawer 내 navigation과 동일하게 이동 시 drawer를 닫는다(`onNavigate`).
- ActivityPub collection URL로는 연결하지 않는다.

## Dependencies

- 링크 대상 라우트(`/@{handle}/following`, `/@{handle}/followers`)는 선행 변경(PROD-179/180 라우트 골격)에서 추가된다. 본 변경은 그 골격이 머지된 뒤 진입점 링크만 추가하므로, 링크는 빈 목록 상태의 실제 라우트를 가리킨다.
- 팔로우 수 표시 순서(`팔로잉 → 팔로워`)는 선행 변경(PROD-178)에서 이미 정정됐다.

## Capabilities

### Modified Capabilities

- `web-app-shell`: 헤더·사이드바 팔로우 수에 목록 라우트 진입점 링크 요구사항을 추가한다(ADDED `Follow count entry-point links`).

## Impact

- `apps/web/src/lib/components/ProfileHero.svelte` — 카운트를 `<a>` 링크로 전환
- `apps/web/src/lib/components/SidebarNavigation.svelte` — 카운트를 `<a>` 링크로 전환
- GraphQL fragment/스키마, API 영향 없음(`handle`·`followersCount`·`followingCount`는 이미 조회 중)

## Out of Scope

- 팔로잉/팔로워 목록 페이지의 데이터 연결 — PROD-184/185
- ActivityPub followers/following collection 연동
- `SidebarNavigation` 기존 raw hex 색상의 디자인 토큰 마이그레이션
