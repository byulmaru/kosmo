## Context

`selectProfile` mutation은 이미 성공 응답으로 선택된 `Profile`과 현재 `Session`을 함께 반환하며, 반환된 `Session.selectedProfile`은 새 active profile을 가리킨다. 웹 앱의 탭 셸, `/compose`, 홈, 검색, 프로필 화면은 active profile 값이나 id를 사용하므로, 프로필 전환 mutation이 같은 `Session` entity의 `selectedProfile` 링크를 Mearie 정규화 캐시에서 갱신한다는 클라이언트 계약을 명확히 해야 한다.

## Goals / Non-Goals

**Goals:**

- 사이드바에서 프로필을 전환하면 사이드바, 이미 열린 `/compose` composer, 홈/검색/프로필 화면의 active profile 판단이 같은 active profile을 즉시 반영한다.
- 일반 프로필 선택은 `currentSession` 전체 수동 invalidation/refetch에 의존하지 않고, mutation 응답의 `Session.selectedProfile`을 앱 셸의 GraphQL 결과 bridge에 즉시 반영한다.
- active profile에 의존하는 root query field는 필요한 범위만 stale 처리하거나 동등하게 갱신한다.

**Non-Goals:**

- GraphQL public schema의 `selectProfile` payload shape를 다시 바꾸지 않는다.
- `homeTimeline`이나 `Profile.viewerFollow` 같은 active-profile 의존 field를 모두 mutation 응답 정규화만으로 해결하지 않는다.
- 새 프로필 생성/선택 흐름과 일반 프로필 선택 흐름의 모든 invalidation을 동일하게 취급하지 않는다.

## Decisions

1. **전환 성공 응답을 셸 표시 입력으로 사용한다.**
   일반 프로필 선택 성공 후에는 `selectProfile.session.id`와 `selectProfile.session.selectedProfile`을 함께 선택한다. 앱 셸은 해당 mutation 응답의 generated GraphQL selected profile 값을 최신 active profile bridge에 반영해, `currentSession` 전체 refetch 없이 사이드바와 `/compose` 작성 프로필을 갱신한다. 이는 scalar를 복제한 별도 프로필 스냅샷이 아니라 서버가 성공 응답에서 확인한 GraphQL fragment ref를 route 경계에 전달하는 흐름이다.

2. **`currentSession` 전체 수동 invalidation/refetch는 일반 선택의 필수 경로로 두지 않는다.**  
   금지하려는 것은 캐시 정책이나 route 재마운트에 따른 자연스러운 재조회가 아니라, 일반 프로필 선택 성공 handler가 `currentSession` 전체를 직접 stale 처리하거나 refetch 완료를 UI 갱신의 전제로 삼는 흐름이다. 일반 선택에서는 mutation 응답의 `Session.selectedProfile`으로 shell/composer 표시를 갱신하고, `homeTimeline`, `Profile.viewerFollow`처럼 active profile에 따라 결과가 달라지는 field만 별도로 stale 처리한다.

3. **새 프로필 생성은 프로필 목록 갱신을 별도 허용한다.**  
   생성 직후에는 선택 프로필 표시뿐 아니라 `me.profiles` 목록 자체가 바뀐다. 따라서 `profile-created` 성격의 성공 처리에서는 `me` 또는 동등한 프로필 목록 데이터를 갱신할 수 있다.

4. **route boundary는 layout의 GraphQL active profile 값을 전달한다.**
   이미 열린 `/compose` 화면과 앱 셸 아래 route들은 자체 `currentSession.selectedProfile` query를 다시 실행하지 않는다. `(tabs)` layout은 최초 표시에는 `TabsLayoutQuery.currentSession.selectedProfile`을 쓰고, 프로필 전환 성공 후에는 mutation 응답의 `Session.selectedProfile` fragment ref를 최신 active profile 값으로 사용한다. `/compose` route는 이 값을 작성 프로필에 사용하고, 홈/검색/프로필 route는 active profile 존재 여부와 viewer profile id 판단에 사용한다. 이 context는 독립 프로필 저장소가 아니라 layout이 가진 GraphQL 결과와 mutation 응답 fragment ref를 route 경계 너머로 전달하는 bridge다.

## Risks / Trade-offs

- **[Risk] mutation 응답 정규화가 열린 query 구독을 즉시 깨우지 못할 수 있음** → mutation selection에 `session.id`와 필요한 `selectedProfile` fragment 데이터를 포함하고, 성공 handler가 해당 GraphQL 응답 값을 layout active profile bridge에 즉시 반영한다.
- **[Risk] active profile 의존 데이터가 일부 stale하게 남을 수 있음** → `homeTimeline`, `Profile.viewerFollow`처럼 active profile을 입력으로 삼는 field는 선택 성공 후 명시적으로 stale 처리하거나 같은 효과의 갱신을 적용한다.
- **[Risk] 생성과 선택의 갱신 범위가 섞일 수 있음** → 성공 이유를 일반 선택과 새 프로필 생성으로 구분해, 생성 시에만 프로필 목록 갱신을 포함한다.
