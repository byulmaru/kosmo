## 1. 프로필 전환 응답 선택 정렬

- [x] 1.1 `ProfileSwitcher`의 `selectProfile` mutation selection에 스위처/앱 셸이 직접 표시하는 `session.selectedProfile` 필드를 포함한다
- [x] 1.2 프로필 선택 성공 후 Mearie cache의 `Session.selectedProfile`/`Query.currentSession` 갱신과 route query refetch가 active profile UI에 반영되게 한다
- [x] 1.3 새 프로필 생성 후 선택되는 흐름과 기존 프로필 선택 흐름을 구분할 수 있는 reason 값을 콜백에 포함한다

## 2. 앱 셸 active profile 동기화

- [x] 2.1 `(tabs)` layout과 사이드바가 scalar snapshot 복제 없이 GraphQL query 결과와 Mearie cache 갱신 결과를 표시 입력으로 사용한다
- [x] 2.2 일반 프로필 선택 성공 handler가 `Query.currentSession`, `homeTimeline`, `Profile.viewerFollow` 같은 active-profile 의존 target을 필요한 범위로 갱신하게 한다
- [x] 2.3 새 프로필 생성 후 선택 성공 시 접근 가능한 프로필 목록 갱신을 위해 `me` 또는 동등한 프로필 목록 데이터를 갱신한다
- [x] 2.4 홈, 검색, 프로필, followers/following route가 자기 query에서 필요한 `currentSession.selectedProfile` 필드를 선언한다

## 3. `/compose` 작성 프로필 반영

- [x] 3.1 `/compose` route가 자기 `ComposePageQuery`에서 `currentSession.selectedProfile { ...PostComposer_profile }`을 선언한다
- [x] 3.2 `/compose` route는 자기 query 결과의 selected profile fragment ref를 composer에 전달한다
- [x] 3.3 selected profile이 없는 상태의 로딩, 비로그인, active profile 없음 분기는 기존 동작을 유지한다

## 4. 검증

- [x] 4.1 E2E에서 프로필 생성 후 composer와 사이드바가 생성된 프로필을 표시하는지 확인한다
- [x] 4.2 E2E에서 이미 열린 `/compose` 화면에서 다른 프로필을 선택하면 `/compose` route query가 active profile을 직접 선언하고 composer가 갱신되는지 확인한다
- [x] 4.3 E2E에서 프로필 route viewer action이 `ProfileLayoutQuery.currentSession.selectedProfile` 갱신 결과를 반영하는지 확인한다
- [x] 4.4 E2E에서 홈 타임라인이 `HomePageQuery.currentSession.selectedProfile` refetch 완료 후 새 active profile 기준 결과를 표시하는지 확인한다
- [x] 4.5 `pnpm exec openspec validate --all --strict`, `pnpm --dir apps/web check`, 관련 E2E, lint/prettier를 실행한다
