## Why

팔로워·팔로잉 목록의 Relay connection과 pagination은 이미 Production에 연결됐지만, 공유 Expo route는 아직 상위 `ProfileHero`와 목록 내부 제목을 유지해 DSN-51의 독립 화면 정본과 다르다. PROD-785에서 기존 데이터 lifecycle을 그대로 두고 두 직접 route의 화면 구조만 Figma 정본에 맞춘다.

## What Changes

- `/@{handle}/followers`와 `/@{handle}/following`을 Profile 홈과 분리된 관계 목록 화면으로 표시한다.
- 두 route는 `ProfileHero` 대신 `~님의 팔로워`·`~님의 팔로잉` `PageHeader`와 `팔로워`·`팔로잉` `TabList`를 표시한다.
- 뒤로가기는 해당 Profile 홈으로, 탭 선택은 같은 Profile의 다른 관계 목록으로 이동한다.
- Mobile Web에서는 셸의 메뉴 전용 헤더를 중복하지 않고 route 헤더가 safe-area 아래의 상단 chrome을 소유한다.
- 기존 `ProfileConnectionList`, Relay connection, edge 순서, 수동 pagination·retry와 Native 단일 외부 scroll은 유지한다.
- follow/unfollow mutation, 권한, Relay cache, pagination 정책과 Profile 홈의 `ProfileHero`는 변경하지 않는다.

## Capabilities

### New Capabilities

- 없음

### Modified Capabilities

- `web-app-shell`: 팔로워·팔로잉 route를 공용 Expo Web·Android·iOS의 독립 관계 목록 화면으로 표시하는 요구사항을 추가한다.

## Impact

- `apps/app/src/app/(tabs)/(profile)/[profileHandle]/_layout.tsx`
- `apps/app/src/components/profile/ProfileConnectionList.tsx`
- `apps/app/src/components/shell/shellLayout.ts`
- 관련 기존 route·shell 테스트와 Profile Storybook
- `docs/design/page-header.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`
- API schema와 Relay connection identity 변경 없음
