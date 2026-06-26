## Context

`selectProfile` mutation은 이미 성공 응답으로 선택된 `Profile`과 현재 `Session`을 함께 반환하며, 반환된 `Session.selectedProfile`은 새 active profile을 가리킨다. 웹 앱의 탭 셸과 `/compose` 화면은 `currentSession.selectedProfile`을 읽으므로, 프로필 전환 mutation이 같은 `Session` entity의 `selectedProfile` 링크를 Mearie 정규화 캐시에서 갱신한다는 클라이언트 계약을 명확히 해야 한다.

## Goals / Non-Goals

**Goals:**

- 사이드바에서 프로필을 전환하면 사이드바와 이미 열린 `/compose` composer가 같은 active profile을 즉시 표시한다.
- 일반 프로필 선택은 `currentSession` 전체 수동 invalidation/refetch에 의존하지 않고, mutation 응답의 `Session.selectedProfile`이 기존 `currentSession` query 결과를 정규화 캐시에서 갱신하게 한다.
- active profile에 의존하는 root query field는 필요한 범위만 stale 처리하거나 동등하게 갱신한다.

**Non-Goals:**

- GraphQL public schema의 `selectProfile` payload shape를 다시 바꾸지 않는다.
- `homeTimeline`이나 `Profile.viewerFollow` 같은 active-profile 의존 field를 모두 mutation 응답 정규화만으로 해결하지 않는다.
- 새 프로필 생성/선택 흐름과 일반 프로필 선택 흐름의 모든 invalidation을 동일하게 취급하지 않는다.

## Decisions

1. **전환 성공 응답을 정규화 캐시 갱신 입력으로 사용한다.**
   일반 프로필 선택 성공 후에는 `selectProfile.session.id`와 `selectProfile.session.selectedProfile`을 함께 선택해, Mearie가 기존 `currentSession`이 가리키는 `Session` entity의 selected profile 링크를 갱신하게 한다. 이는 별도 Svelte 상태 복제가 아니라 서버가 성공 응답에서 확인한 세션 상태를 기존 GraphQL cache 경로로 반영하는 흐름이다.

2. **`currentSession` 전체 수동 invalidation/refetch는 일반 선택의 필수 경로로 두지 않는다.**  
   금지하려는 것은 캐시 정책이나 route 재마운트에 따른 자연스러운 재조회가 아니라, 일반 프로필 선택 성공 handler가 `currentSession` 전체를 직접 stale 처리하거나 refetch 완료를 UI 갱신의 전제로 삼는 흐름이다. 일반 선택에서는 mutation 응답의 정규화 캐시 갱신으로 shell/composer 표시를 갱신하고, `homeTimeline`, `Profile.viewerFollow`처럼 active profile에 따라 결과가 달라지는 field만 별도로 stale 처리한다.

3. **새 프로필 생성은 프로필 목록 갱신을 별도 허용한다.**  
   생성 직후에는 선택 프로필 표시뿐 아니라 `me.profiles` 목록 자체가 바뀐다. 따라서 `profile-created` 성격의 성공 처리에서는 `me` 또는 동등한 프로필 목록 데이터를 갱신할 수 있다.

4. **route query는 기존 GraphQL cache 경로를 계속 소비한다.**
   이미 열린 `/compose` 화면은 별도 context나 local snapshot을 우선하지 않고 `currentSession.selectedProfile`을 계속 읽는다. 프로필 전환 mutation selection은 `session.id`와 `session.selectedProfile`에 composer가 요구하는 fragment를 포함해, 같은 `Session` entity 갱신만으로 작성 프로필이 바뀌게 한다.

## Risks / Trade-offs

- **[Risk] mutation 응답이 `Session.selectedProfile` 링크를 갱신하지 못할 수 있음** → mutation selection에 `session.id`와 필요한 `selectedProfile` fragment 데이터를 포함해, Mearie 정규화 캐시가 기존 `currentSession` 결과를 갱신할 수 있게 한다.
- **[Risk] active profile 의존 데이터가 일부 stale하게 남을 수 있음** → `homeTimeline`, `Profile.viewerFollow`처럼 active profile을 입력으로 삼는 field는 선택 성공 후 명시적으로 stale 처리하거나 같은 효과의 갱신을 적용한다.
- **[Risk] 생성과 선택의 갱신 범위가 섞일 수 있음** → 성공 이유를 일반 선택과 새 프로필 생성으로 구분해, 생성 시에만 프로필 목록 갱신을 포함한다.
