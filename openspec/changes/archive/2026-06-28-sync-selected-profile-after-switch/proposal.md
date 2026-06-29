## Why

프로필 전환 mutation은 성공 응답으로 갱신된 `Session.selectedProfile`을 제공하지만, 이미 열린 웹 셸과 `/compose`, 홈, 검색, 프로필 화면이 그 값을 즉시 반영해야 한다는 클라이언트 계약이 명확하지 않다. 사용자가 사이드바에서 프로필을 바꾼 직후 작성자 표시와 사이드바 프로필, active profile 기반 화면 판단이 서로 어긋나지 않도록, 프로필 선택 응답 기반 동기화 요구사항을 먼저 확정한다. (Linear PROD-130)

## What Changes

- 사이드바 프로필 전환 성공 후 앱 셸의 활성 프로필 표시는 mutation 응답의 갱신된 `Session.selectedProfile`을 기준으로 즉시 바뀌어야 한다.
- 이미 열린 `/compose` 화면의 새 글 작성 컴포넌트도 같은 전환 결과를 반영해 작성 프로필을 즉시 바꿔야 한다.
- 홈, 검색, 프로필 화면의 active profile 존재 여부와 viewer profile id 판단도 같은 전환 결과를 반영해야 한다.
- 일반 프로필 선택은 `currentSession` 전체 수동 invalidation/refetch에 의존하지 않고, 선택 mutation 응답이 Mearie 정규화 캐시의 `Session.selectedProfile` 링크를 갱신하게 하며, `homeTimeline`, `Profile.viewerFollow` 같은 active-profile 의존 field는 필요한 범위만 갱신해야 한다.
- 새 프로필 생성 후 선택되는 경우에는 접근 가능한 프로필 목록 갱신이 필요하므로 `me.profiles` 계열 데이터 갱신을 허용한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 사이드바 프로필 전환 후 웹 셸의 활성 프로필 표시와 관련 active-profile 의존 데이터를 갱신하는 요구사항을 구체화한다.
- `post`: `/compose` 사용처가 프로필 전환 성공 직후 새 active profile을 작성자 프로필로 반영해야 한다는 요구사항을 추가한다.

## Impact

- `apps/web`: 프로필 스위처, 탭 셸 layout, 사이드바, `/compose`, 홈, 검색, 프로필 route의 선택 프로필 데이터 흐름이 영향을 받는다.
- GraphQL public schema/API shape는 변경하지 않는다. `selectProfile` 성공 응답의 `session.selectedProfile` 계약은 기존 `profile` 스펙을 따른다.
- `homeTimeline`처럼 active profile에 의존하는 root query field는 프로필 전환 후 stale 처리 또는 동등한 갱신 전략이 필요하다.
