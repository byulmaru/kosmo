## Why

프로필 전환 mutation은 성공 응답으로 갱신된 `Session.selectedProfile`을 제공하지만, 이미 열린 웹 셸과 `/compose`, 홈, 검색, 프로필 화면이 active profile 변경을 어떤 GraphQL operation을 통해 반영해야 하는지 클라이언트 계약이 명확하지 않다. 사용자가 사이드바에서 프로필을 바꾼 뒤 각 화면이 자기 데이터 요구사항을 route-local GraphQL operation에 드러내고, Mearie cache 갱신과 필요한 refetch를 통해 active profile 기반 UI를 비동기적으로 반영하도록 요구사항을 확정한다. (Linear PROD-130)

## What Changes

- 사이드바 프로필 전환 성공 후 앱 셸의 활성 프로필 표시는 Mearie cache의 `Session.selectedProfile`/`Query.currentSession` 갱신을 반영해야 한다.
- 이미 열린 `/compose` 화면의 새 글 작성 컴포넌트는 `/compose` route query가 선언한 `currentSession.selectedProfile { ...PostComposer_profile }` 결과를 작성 프로필로 사용해야 한다.
- 홈, 검색, 프로필, followers/following 화면의 active profile 존재 여부와 viewer profile id 판단도 각 route query가 자기에게 필요한 `currentSession.selectedProfile` 필드를 선언해야 한다.
- 일반 프로필 선택은 `Query.currentSession`, `Query.homeTimeline`, `Profile.viewerFollow` 등 active-profile 의존 cache target을 stale 처리하고, Mearie가 각 구독 route query를 비동기적으로 갱신하게 둔다.
- 새 프로필 생성 후 선택되는 경우에는 접근 가능한 프로필 목록 갱신이 필요하므로 `me.profiles` 계열 데이터 갱신을 허용한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 사이드바 프로필 전환 후 웹 셸의 활성 프로필 표시와 관련 active-profile 의존 데이터를 갱신하는 요구사항을 구체화한다.
- `post`: `/compose` 사용처가 프로필 전환 성공 직후 새 active profile을 작성자 프로필로 반영해야 한다는 요구사항을 추가한다.

## Impact

- `apps/web`: 프로필 스위처, 탭 셸 layout, 사이드바, `/compose`, 홈, 검색, 프로필, followers/following route의 선택 프로필 데이터 흐름이 영향을 받는다.
- GraphQL public schema/API shape는 변경하지 않는다. `selectProfile` 성공 응답의 `session.selectedProfile` 계약은 기존 `profile` 스펙을 따른다.
- `homeTimeline`처럼 active profile에 의존하는 root query field는 프로필 전환 후 stale 처리 또는 동등한 갱신 전략이 필요하다.
