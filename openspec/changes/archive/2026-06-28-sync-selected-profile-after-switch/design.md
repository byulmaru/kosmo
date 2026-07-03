## Context

`selectProfile` mutation은 성공 응답으로 선택된 `Profile`과 현재 `Session`을 함께 반환하며, 반환된 `Session.selectedProfile`은 새 active profile을 가리킨다. 웹 앱은 이 mutation 응답이 Mearie normalized cache의 `Session.selectedProfile`을 갱신하는 것을 active profile의 주 경로로 삼는다. 새 프로필 생성은 접근 가능한 프로필 목록도 바꾸므로 `createProfile` payload가 `Account.profiles`를 함께 반환해 계정 소유 프로필 목록 cache를 갱신한다.

최신 main 기준 검색, 프로필, followers/following 목록의 팔로우 액션은 `Profile.viewerState`가 소유한다. 따라서 이런 화면에 viewer 판단용 `currentSession.selectedProfile` 또는 `viewerProfileId` 흐름을 다시 추가하지 않고, 실제 active profile 객체가 필요한 앱 셸, `/compose`, 홈 경계에서만 `currentSession.selectedProfile`을 선언한다.

## Goals / Non-Goals

**Goals:**

- 사이드바에서 프로필을 전환하면 `selectProfile.session.selectedProfile` mutation 응답이 Mearie normalized cache의 active profile source of truth를 갱신한다.
- 새 프로필 생성 후에는 `createProfile.account.profiles` 응답이 접근 가능한 프로필 목록 cache를 갱신한다.
- active profile 객체가 실제로 필요한 route만 자기 GraphQL operation에 필요한 `currentSession.selectedProfile` field 또는 fragment를 선언한다.
- active profile을 암묵 입력으로 쓰는 root/entity field는 필요한 범위만 stale 처리하거나 동등하게 갱신한다.

**Non-Goals:**

- GraphQL public schema의 `selectProfile` payload shape를 다시 바꾸지 않는다.
- `homeTimeline`이나 `Profile.viewerState` 같은 active-profile 의존 field를 모두 mutation 응답 정규화만으로 해결하지 않는다.
- 검색, 프로필, follow list 화면에 viewer 판단용 `viewerProfileId` route 흐름을 다시 만들지 않는다.

## Decisions

1. **Mearie cache를 active profile의 source of truth로 둔다.**
   일반 프로필 선택 성공 후에는 `selectProfile.session.id`와 스위처/앱 셸이 직접 표시하는 `selectedProfile` 필드를 함께 선택한다. 별도 Svelte 상태나 layout context로 active profile을 복제하지 않고, mutation 응답이 Mearie cache의 `Session.selectedProfile`을 갱신하게 한다. 이 필드 자체를 맞추기 위해 `Query.currentSession`을 넓게 stale 처리하지 않는다.

2. **새 프로필 생성은 계정 소유 목록을 mutation 응답으로 갱신한다.**
   `createProfile` payload는 생성된 `profile`과 함께 현재 계정의 `account { id profiles { ... } }`를 반환한다. 프로필 스위처는 이 응답을 선택해 `Account.profiles` cache를 갱신하고, 생성 성공 후 `Query.me`를 별도로 stale 처리하지 않는다.

3. **각 route가 자기 active profile 의존성을 선언한다.**
   `/compose`는 `currentSession.selectedProfile { ...PostComposer_profile }`, 홈은 `currentSession.selectedProfile { id }`를 자기 query에 둔다. 검색/프로필/follow list는 최신 main의 `Profile.viewerState` 책임 분리를 따르며, viewer 판단을 위해 `currentSession.selectedProfile`이나 `viewerProfileId`를 추가하지 않는다. layout context는 프로필 스위처 열기 같은 UI command에만 사용하고, GraphQL fragment ref를 하위 route에 전달하지 않는다.

4. **전환 후 파생 데이터 갱신은 비동기 refetch를 허용한다.**
   일반 선택 handler는 `Query.homeTimeline`, `Profile.viewerState` 같은 active-profile 의존 cache target만 stale 처리한다. `homeTimeline`은 root field라 mutation 응답만으로 새 active profile 기준 데이터를 덮기 어렵고, `Profile.viewerState`는 팔로우 버튼이 읽는 viewer-relative entity field다. Mearie가 각 구독 query를 다시 실행하면서 해당 UI가 새 active profile 기준으로 갱신된다. 전환 직후 한 순간 이전 데이터가 보일 수 있는 것은 허용한다.

## Risks / Trade-offs

- **[Risk] mutation payload가 필요한 owner object를 빠뜨리면 cache가 갱신되지 않을 수 있음** → `selectProfile`은 `session.selectedProfile`, `createProfile`은 `account.profiles`를 응답에 포함한다.
- **[Risk] active profile 의존 데이터가 일부 stale하게 남을 수 있음** → `homeTimeline`, `Profile.viewerState`처럼 active profile을 암묵 입력으로 삼는 field는 선택 성공 후 명시적으로 stale 처리하거나 같은 효과의 갱신을 적용한다.
- **[Risk] 최신 main의 follow 책임 분리를 되돌릴 수 있음** → 검색/프로필/follow list에는 `viewerProfileId` route 흐름을 추가하지 않고 `Profile.viewerState`를 유지한다.
