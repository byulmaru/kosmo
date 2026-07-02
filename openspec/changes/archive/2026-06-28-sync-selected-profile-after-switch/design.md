## Context

`selectProfile` mutation은 이미 성공 응답으로 선택된 `Profile`과 현재 `Session`을 함께 반환하며, 반환된 `Session.selectedProfile`은 새 active profile을 가리킨다. 웹 앱의 탭 셸, `/compose`, 홈, 검색, 프로필, followers/following 화면은 active profile 값이나 id를 사용하므로, 각 화면이 자기 GraphQL operation에서 필요한 `currentSession.selectedProfile` 필드를 선언하고 Mearie cache 갱신/refetch를 통해 변경을 반영한다는 클라이언트 계약을 명확히 해야 한다.

## Goals / Non-Goals

**Goals:**

- 사이드바에서 프로필을 전환하면 Mearie cache의 `Session.selectedProfile`/`Query.currentSession` 갱신과 route query refetch를 통해 active profile UI가 같은 source of truth를 바라본다.
- active profile이 필요한 route는 자기 GraphQL operation에 필요한 `currentSession.selectedProfile` field 또는 fragment를 선언한다.
- active profile에 의존하는 root/entity field는 필요한 범위만 stale 처리하거나 동등하게 갱신한다.

**Non-Goals:**

- GraphQL public schema의 `selectProfile` payload shape를 다시 바꾸지 않는다.
- `homeTimeline`이나 `Profile.viewerFollow` 같은 active-profile 의존 field를 모두 mutation 응답 정규화만으로 해결하지 않는다.
- 새 프로필 생성/선택 흐름과 일반 프로필 선택 흐름의 모든 invalidation을 동일하게 취급하지 않는다.

## Decisions

1. **Mearie cache를 active profile의 source of truth로 둔다.**
   일반 프로필 선택 성공 후에는 `selectProfile.session.id`와 스위처/앱 셸이 직접 표시하는 `selectedProfile` 필드를 함께 선택한다. 별도 Svelte 상태나 layout context로 active profile을 복제하지 않고, Mearie cache의 `Session.selectedProfile`/`Query.currentSession` 갱신 결과를 각 구독 query가 바라보게 한다.

2. **각 route가 자기 active profile 의존성을 선언한다.**
   `/compose`는 `currentSession.selectedProfile { ...PostComposer_profile }`, 홈은 `currentSession.selectedProfile { id }`, 검색/프로필/follow list는 viewer 판단에 필요한 `id`를 자기 query에 둔다. layout context는 프로필 스위처 열기 같은 UI command에만 사용하고, GraphQL fragment ref를 하위 route에 전달하지 않는다.

3. **새 프로필 생성은 프로필 목록 갱신을 별도 허용한다.**  
   생성 직후에는 선택 프로필 표시뿐 아니라 `me.profiles` 목록 자체가 바뀐다. 따라서 `profile-created` 성격의 성공 처리에서는 `me` 또는 동등한 프로필 목록 데이터를 갱신할 수 있다.

4. **전환 후 갱신은 비동기 refetch를 허용한다.**
   일반 선택 handler는 `Query.currentSession`, `Query.homeTimeline`, `Profile.viewerFollow` 같은 active-profile 의존 cache target을 stale 처리한다. Mearie가 각 구독 query를 다시 실행하면서 `/compose`, 홈, 검색, 프로필, follow list UI가 새 active profile 기준으로 갱신된다. 전환 직후 한 순간 이전 데이터가 보일 수 있는 것은 허용한다.

## Risks / Trade-offs

- **[Risk] mutation 응답 정규화가 열린 query 구독을 즉시 깨우지 못할 수 있음** → 선택 성공 handler가 `Query.currentSession`을 stale 처리해 route-local active profile query가 비동기적으로 다시 실행되게 한다.
- **[Risk] active profile 의존 데이터가 일부 stale하게 남을 수 있음** → `homeTimeline`, `Profile.viewerFollow`처럼 active profile을 입력으로 삼는 field는 선택 성공 후 명시적으로 stale 처리하거나 같은 효과의 갱신을 적용한다.
- **[Risk] 생성과 선택의 갱신 범위가 섞일 수 있음** → 성공 이유를 일반 선택과 새 프로필 생성으로 구분해, 생성 시에만 프로필 목록 갱신을 포함한다.
