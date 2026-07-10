## Why

이 active directory는 이미 archive된 `2026-06-24-fix-profile-follow-count-order` 완료 change의 중복이다. 확정된 제품 계약은 프로필 헤더(`ProfileHero`)와 사이드바(`SidebarNavigation`) 모두 `팔로잉 → 팔로워` 순서를 사용하고, Expo migration에서도 이를 보존하는 것이다. (Linear PROD-178)

## What Changes

- 팔로우 수 표시 순서를 `팔로잉 → 팔로워`로 정정한다(`ProfileHero`, `SidebarNavigation` 모두).
- 카운트 값과 라벨이 어긋나지 않도록(팔로잉=followingCount, 팔로워=followersCount) 맞춘다.

## Capabilities

### Modified Capabilities

- `web-app-shell`: 프로필 기본 정보 표시의 팔로우 수 순서를 `팔로잉 → 팔로워`로 수정한다(MODIFIED `Profile basic information display`).

## Impact

- `apps/app/src/components/profile/ProfileHero.tsx` — `followingCount → followersCount` 순서 보존
- `apps/app/src/components/shell/SidebarNavigation.tsx` — 활성 프로필 `followingCount → followersCount` 순서 보존
- GraphQL fragment/스키마, API 영향 없음(`followersCount`·`followingCount`는 이미 조회 중)

## Out of Scope

- 팔로잉/팔로워 수에서 목록 라우트로 가는 진입점 링크 연결 — 별도 변경(목록 라우트 골격이 머지된 뒤 진행)
- 팔로잉/팔로워 목록 페이지(라우트·상태 UI·데이터 연결) 구현 — PROD-179/180/184/185
- ActivityPub followers/following collection 연동
- `SidebarNavigation` 색상의 디자인 토큰 마이그레이션
