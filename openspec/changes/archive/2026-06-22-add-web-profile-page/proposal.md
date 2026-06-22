## Why

주소창에 핸들을 입력해 특정 프로필을 직접 볼 수 있는 웹 프로필 페이지가 필요했다. 백엔드 `profileByHandle(handle:)` 조회는 이미 존재하지만(PROD-70) 이를 표시할 프론트엔드 라우트·화면이 없었다. PROD-91에서 이 페이지를 구현했고, 본 체인지는 그 결과를 `web-app-shell` 스펙에 backfill하여 계약을 최신화한다.

## What Changes

- `apps/web`에 핸들 기반 프로필 페이지 라우트 `(tabs)/@[handle]`를 추가한다. `/@{handle}` 형식으로 접근하며, `@` 프리픽스 덕분에 정적 엔드포인트(`/login`·`/graphql`·`/health`)와 클라이언트 라우팅이 충돌하지 않는다.
- `profileByHandle` GraphQL query를 layout에서 조회해 프로필 하위 화면에서 재사용한다.
- 프로필 기본 정보(커버 밴드, 이니셜 아바타, 표시 이름, `@handle`, bio, 팔로워/팔로잉 수)를 `ProfileHero` 컴포넌트로 표시한다. 카운트는 compact 표기(예: `1.2k`).
- 로딩·조회 오류·없는 프로필 상태를 처리하며, 오류·빈 상태에서도 상위 `(tabs)` 셸(사이드바·하단탭)을 유지한다.
- 공유 셸을 건드리지 않고 프로필 라우트만 탑정렬 + 모바일 풀블리드 / 데스크톱 가운데 컬럼(구분선)으로 정렬한다.
- 사이드바 "프로필" 항목을 현재 세션의 선택된 프로필 페이지(`/@{handle}`)로 연결하고, 선택된 프로필이 없으면 항목을 비활성화한다.
- (Non-goals) 팔로우/편집 버튼(PROD-96), 게시글 목록·ProfileTabs(PROD-88), 태그칩·ProfileMeta(위치/가입일/링크)·아바타 이미지(스키마 미보유), 데스크톱 3분할 셸·오른쪽 컬럼(차후 웹 레이아웃 이슈)은 본 체인지 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 핸들 기반 프로필 페이지 라우트·기본 정보 표시·상태 처리·컬럼 정렬 요구사항을 추가하고, 사이드바 프로필 진입점이 선택된 프로필 페이지로 연결되도록 명세한다.

## Impact

- 영향 코드(apps/web): `routes/(tabs)/@[handle]/+layout.svelte`, `routes/(tabs)/@[handle]/+page.svelte`, `lib/components/ProfileHero.svelte`(+ `ProfileHero.stories.svelte`), `lib/components/SidebarNavigation.svelte`, `lib/utils/profile.ts`.
- 소비 API: 기존 `profileByHandle` GraphQL query — 백엔드 변경 없음(`profile` 백엔드 계약 스펙 불변).
- backfill: 코드는 PROD-91(PR #69)에서 이미 구현·검증 완료(svelte-check / build / Storybook 통과).
