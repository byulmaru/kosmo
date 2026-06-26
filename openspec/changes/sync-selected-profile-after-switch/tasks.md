## 1. 프로필 전환 응답 선택 정렬

- [x] 1.1 `ProfileSwitcher`의 `selectProfile` mutation selection에 `session.selectedProfile`과 composer/sidebar가 즉시 필요한 `Profile` fragment 데이터를 포함한다
- [x] 1.2 프로필 선택 성공 응답이 기존 `Session` entity의 `selectedProfile` 링크를 Mearie 정규화 캐시에서 갱신하게 한다
- [x] 1.3 새 프로필 생성 후 선택되는 흐름과 기존 프로필 선택 흐름을 구분할 수 있는 reason 값을 콜백에 포함한다

## 2. 앱 셸 active profile 동기화

- [x] 2.1 `(tabs)` layout과 사이드바가 별도 local snapshot 없이 `currentSession.selectedProfile` GraphQL cache 경로를 표시 입력으로 사용한다
- [x] 2.2 일반 프로필 선택 성공 handler가 `currentSession` 전체 수동 invalidation/refetch에 의존하지 않고, `homeTimeline`, `Profile.viewerFollow` 같은 active-profile 의존 field만 필요한 범위로 갱신하게 한다
- [x] 2.3 새 프로필 생성 후 선택 성공 시 접근 가능한 프로필 목록 갱신을 위해 `me` 또는 동등한 프로필 목록 데이터를 갱신한다

## 3. `/compose` 작성 프로필 반영

- [x] 3.1 `/compose` route가 별도 context 없이 `currentSession.selectedProfile` GraphQL cache 경로를 사용한다
- [x] 3.2 `/compose` route는 정규화 캐시에 갱신된 `currentSession.selectedProfile`을 composer에 전달한다
- [x] 3.3 selected profile이 없는 상태의 로딩, 비로그인, active profile 없음 분기는 기존 동작을 유지한다

## 4. 검증

- [x] 4.1 E2E에서 프로필 생성 후 composer와 사이드바가 생성된 프로필을 표시하는지 확인한다
- [x] 4.2 E2E에서 이미 열린 `/compose` 화면에서 다른 프로필을 선택하면 composer와 사이드바가 즉시 새 프로필을 표시하는지 확인한다
- [x] 4.3 E2E에서 일반 프로필 선택 성공 handler가 `currentSession` 전체 invalidation/refetch를 직접 요구하지 않고, 필요한 mutation과 active-profile 의존 field 갱신만 발생시키는지 확인한다
- [ ] 4.4 `pnpm exec openspec validate sync-selected-profile-after-switch --strict`, `pnpm --dir apps/web check`, 관련 E2E, lint/prettier를 실행한다
  - 리뷰 반영 후 로컬 상태: OpenSpec validate, web check, ESLint, Prettier는 통과했다. E2E 명령은 시도했지만 Docker daemon을 사용할 수 없어 테스트 실행 전에 중단됐다.
