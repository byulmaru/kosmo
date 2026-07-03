## 1. 프로필 전환 응답 선택 정렬

- [x] 1.1 `ProfileSwitcher`의 `selectProfile` mutation selection에 스위처/앱 셸이 직접 표시하는 `session.selectedProfile` 필드를 포함한다
- [x] 1.2 프로필 선택 성공 후 `selectProfile.session.selectedProfile` mutation 응답이 Mearie cache의 active profile UI에 반영되게 한다
- [x] 1.3 `createProfile` payload에 `account.profiles`를 포함해 새 프로필 생성 후 접근 가능한 프로필 목록 cache가 갱신되게 한다

## 2. 앱 셸 active profile 동기화

- [x] 2.1 `(tabs)` layout과 사이드바가 scalar snapshot 복제 없이 GraphQL query 결과와 Mearie cache 갱신 결과를 표시 입력으로 사용한다
- [x] 2.2 일반 프로필 선택 성공 handler가 `homeTimeline`, `Profile.viewerState` 같은 active-profile 의존 파생 target만 필요한 범위로 갱신하게 한다
- [x] 2.3 새 프로필 생성 후 선택 성공 시 `createProfile.account.profiles` 응답으로 접근 가능한 프로필 목록 cache를 갱신한다
- [x] 2.4 홈과 `/compose`처럼 active profile 객체가 필요한 route만 자기 query에서 필요한 `currentSession.selectedProfile` 필드를 선언한다
- [x] 2.5 검색, 프로필, followers/following route는 최신 main의 `Profile.viewerState` 책임 분리를 유지하고 viewer 판단용 route state를 추가하지 않는다

## 3. `/compose` 작성 프로필 반영

- [x] 3.1 `/compose` route가 자기 `ComposePageQuery`에서 `currentSession.selectedProfile { ...PostComposer_profile }`을 선언한다
- [x] 3.2 `/compose` route는 자기 query 결과의 selected profile fragment ref를 composer에 전달한다
- [x] 3.3 selected profile이 없는 상태의 로딩, 비로그인, active profile 없음 분기는 기존 동작을 유지한다

## 4. 검증

- [x] 4.1 E2E에서 프로필 생성 후 composer와 사이드바가 생성된 프로필을 표시하는지 확인한다
- [x] 4.2 E2E에서 이미 열린 `/compose` 화면에서 다른 프로필을 선택하면 `selectProfile.session.selectedProfile` mutation 응답이 cache 갱신에 필요한 객체 필드를 포함하고 composer가 갱신되는지 확인한다
- [x] 4.3 E2E에서 프로필 route viewer action이 `Profile.viewerState` 기준으로 갱신되는지 확인한다
- [x] 4.4 E2E에서 홈 타임라인이 `homeTimeline` stale 처리 후 `HomePageQuery.currentSession.selectedProfile` refetch 완료와 함께 새 active profile 기준 결과를 표시하는지 확인한다
- [x] 4.5 `pnpm exec openspec validate --all --strict`, `pnpm --dir apps/web check`, 관련 E2E, lint/prettier를 실행한다
