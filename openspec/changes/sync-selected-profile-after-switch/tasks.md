## 1. 프로필 전환 응답 선택 정렬

- [ ] 1.1 `ProfileSwitcher`의 `selectProfile` mutation selection에 `session.selectedProfile`과 composer/sidebar가 즉시 필요한 `Profile` fragment 데이터를 포함한다
- [ ] 1.2 프로필 선택 성공 처리에서 서버 응답의 `Session.selectedProfile`을 상위 앱 셸로 전달한다
- [ ] 1.3 새 프로필 생성 후 선택되는 흐름과 기존 프로필 선택 흐름을 구분할 수 있는 reason 값을 콜백에 포함한다

## 2. 앱 셸 active profile 동기화

- [ ] 2.1 `(tabs)` layout이 프로필 전환 성공 응답에서 온 최신 selected profile을 보관하고 사이드바 표시 입력으로 사용한다
- [ ] 2.2 일반 프로필 선택 성공 시 `currentSession` 전체 invalidation을 사용하지 않고 `homeTimeline` 및 active-profile 의존 field만 갱신한다
- [ ] 2.3 새 프로필 생성 후 선택 성공 시 접근 가능한 프로필 목록 갱신을 위해 `me` 또는 동등한 프로필 목록 데이터를 갱신한다

## 3. `/compose` 작성 프로필 반영

- [ ] 3.1 `/compose` route가 앱 셸의 최신 selected profile을 받을 수 있는 좁은 전달 경로를 사용한다
- [ ] 3.2 `/compose` route는 최신 selected profile이 있으면 route query의 기존 `currentSession.selectedProfile`보다 우선해 composer에 전달한다
- [ ] 3.3 selected profile이 없는 상태의 로딩, 비로그인, active profile 없음 분기는 기존 동작을 유지한다

## 4. 검증

- [ ] 4.1 E2E에서 프로필 생성 후 composer와 사이드바가 생성된 프로필을 표시하는지 확인한다
- [ ] 4.2 E2E에서 이미 열린 `/compose` 화면에서 다른 프로필을 선택하면 composer와 사이드바가 즉시 새 프로필을 표시하는지 확인한다
- [ ] 4.3 E2E에서 일반 프로필 선택 후 `currentSession` 계열 query refetch 없이 필요한 mutation/invalidation만 발생하는지 확인한다
- [ ] 4.4 `pnpm exec openspec validate sync-selected-profile-after-switch --strict`, `pnpm --dir apps/web check`, 관련 E2E, lint/prettier를 실행한다
