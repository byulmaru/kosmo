## Context

공용 Expo route의 팔로워·팔로잉 목록은 `ProfileConnectionList`와 Relay pagination을 이미 사용한다. 그러나 `[profileHandle]/_layout.tsx`가 모든 하위 route에 `ProfileHero`를 렌더하고 목록 컴포넌트도 `팔로워`·`팔로잉` 제목을 추가한다. DSN-51 Mobile 정본 `1943:1852`·`1943:1998`과 Compact/Full 공통 계약은 이 두 화면을 `PageHeader`와 관계 `TabList`로 시작하는 독립 route로 정의한다.

## Goals / Non-Goals

**Goals:**

- Web·Android·iOS의 두 직접 route에서 `ProfileHero`를 제거하고 정본의 `PageHeader`·관계 탭 구조를 사용한다.
- 현재 Profile의 표시 이름과 `relativeHandle`로 제목, Profile 홈 복귀, 관계 탭 이동을 구성한다.
- Mobile Web 셸 헤더 중복을 막고 Native에서는 기존 단일 `PaginationScrollView`를 유지한다.
- 목록의 loading·error·empty·content·추가 페이지 상태와 Relay 책임을 보존한다.

**Non-Goals:**

- Profile 홈의 `ProfileHero` 또는 게시물 목록 구조 변경.
- follow/unfollow mutation, 권한, Relay cache·connection identity, pagination 정책 변경.
- 새 route, 새 상태 관리 계층, 전용 Web/Native 구현 추가.

## Decisions

- Profile route layout이 현재 pathname의 마지막 segment로 `followers`·`following`을 판별하고 관계 화면 chrome과 leaf `Slot`을 같은 외부 scroll 안에 렌더한다.
  - 이유: 두 leaf가 공유하는 Profile query와 Native scroll owner를 유지하면서 `ProfileHero`만 route별로 교체한다.
  - 대안: 각 leaf route에 별도 header wrapper를 복제하면 query와 navigation chrome이 중복된다.
- 기존 `ProfileLayoutQuery`에 `displayName`과 `relativeHandle`을 직접 선택한다.
  - 이유: layout이 route 제목과 navigation URL을 실제로 소비하며, 표시 URL에는 lookup용 `handle`이 아니라 `relativeHandle`을 사용한다.
- 관계 chrome은 기존 `PageHeader`, `IconButton`, `TabList`·`Tab`만 조합한다.
  - 뒤로가기는 history 상태에 의존하지 않고 해당 Profile 홈으로 이동한다.
  - 탭은 현재 route를 controlled value로 표시하고 다른 값 선택 시 같은 Profile의 관계 route로 `replace`한다.
- `ProfileConnectionList` 내부의 별도 `ConnectionTitle`은 제거한다.
  - 이유: route `PageHeader`와 `TabList`가 현재 화면과 선택 관계를 이미 명명하므로 같은 제목은 정본에 없고 heading도 중복한다.
- Mobile Web의 두 관계 route는 `isWebMobileRouteOwnedHeader`에 포함한다.
  - 이유: 셸의 메뉴 전용 64px header와 route의 64px `PageHeader`가 동시에 렌더되는 것을 막고 기존 route safe-area 경계를 재사용한다.
- Relay fragment, edge 순서, `loadNext(20)`, 추가 조회 오류 재시도는 변경하지 않는다.
  - 이유: 화면 presentation 동기화만 PROD-785 범위이며 pagination은 별도 계약이 이미 소유한다.

## Risks / Trade-offs

- **긴 display name이 제목 높이를 늘릴 수 있음** → `PageHeader`의 기존 reflow 계약을 그대로 사용하고 한 줄 강제나 새 truncation을 추가하지 않는다.
- **Mobile Web에서 헤더가 중복될 수 있음** → shell route-owned header 판정의 실행 테스트로 두 경로를 고정한다.
- **Native scroll이 중첩될 수 있음** → layout의 기존 `PaginationScrollView` 하나만 유지하고 leaf 목록에 새 scroll container를 추가하지 않는다.
- **탭 이동이 현재 Profile을 잃을 수 있음** → query의 `relativeHandle`로 두 URL을 만들고 route 테스트에서 둘 다 확인한다.

## Decision history

- 2026-09-09: PROD-785가 DSN-51의 독립 followers/following route를 Web·Android·iOS Production으로 이관하고, 기존 데이터·pagination lifecycle은 유지한다.
