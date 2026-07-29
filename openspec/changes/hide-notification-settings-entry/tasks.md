## 1. PROD-541 알림 화면 설정 진입점 비노출

이 section은 2026-07-29에 notification-only slice로 구현·검증·archive했던 범위와 실행 증거를 기록한다. 2026-07-30 범위 재확인으로 추가된 현재 sidebar 구현 경계는 section 2가 소유한다.

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-541`
- `PROD-487` (사이드바 피드백 진입점의 독립 소유권)

**Deliverable**

설정 기능 공개 전 `/notifications` header에 설정 진입 control이 시각·접근성 트리로 노출되지 않으며, `알림` 제목과 기존 목록 동작 및 사이드바 피드백 진입점은 그대로 유지된다.

**Guardrails**

- 설정 glyph만 숨기고 invisible interactive control을 남기지 않는다.
- 설정 route, 대체 아이콘, 임시 안내 action과 향후 `설정 & 지원` dropdown을 추가하지 않는다.
- Notification Relay data, pagination, Read/cache와 list item 동작을 변경하지 않는다.
- 이 notification-only slice에서는 SidebarNavigation, `/feedback`와 PROD-487의 피드백 진입점을 변경하지 않았다. 현재 final diff의 sidebar guardrail은 section 2를 따른다.

**Verification**

- 테스트 코드 범위: Notifications Storybook의 header policy interaction 검증.
- 테스트 필요성: `알림` heading 유지, `알림 설정 (준비 중)` button 부재, 기존 탭·새로고침 비노출을 직접 증명한다.
- 테스트 제외 범위: 새 fixture·helper·harness, Relay mock 변경, 관련 없는 Notification 상태 조합, snapshot과 테스트 인프라 변경.
- Web에서 mobile/center-column viewport의 header 정렬과 설정 control 비노출을 관찰하고, Android·iOS runtime 관찰 여부를 자동화와 구분해 기록한다.
- App test/check, 변경 파일 lint·Prettier, scoped/all OpenSpec strict validation과 `git diff --check`를 통과한다.
- 2026-07-29 notification-only slice diff에 SidebarNavigation, `/feedback`, API, DB, dependency와 migration 변경이 없음을 확인했다.

**실행 기록 (2026-07-29)**

- Web Storybook 390×844, 600×900: `알림` heading과 64px header geometry를 유지하고 `알림 설정 (준비 중)` button이 시각·접근성 트리에 없으며 가로 overflow가 없음을 확인했다.
- Android·iOS native runtime: 미실행. Web Storybook 관찰 및 자동화 결과와 구분한다.
- `CI=true pnpm --filter @kosmo/app test`: Relay compile, unit 52/52, Storybook 155/155 통과.
- 변경 파일 ESLint·Prettier, scoped/all OpenSpec strict validation(49/49), `git diff --check`와 scope diff 검사 통과.

- [x] 1.1 notification header에서 설정 진입 control을 시각·접근성 트리에서 제거하고 기존 제목·header geometry와 목록 동작을 유지한다.
- [x] 1.2 최소 Storybook 검증을 새 비노출 계약에 맞추고 관련 없는 fixture·interaction을 변경하지 않는다.
- [x] 1.3 mobile/Web viewport와 접근성 동작을 확인하고 Android·iOS runtime을 포함해 실행한 검증과 미실행 검증을 구분해 기록한다.
- [x] 1.4 관련 자동화, formatting, scoped/all strict validation과 scope diff 검사를 통과한다.
- [x] 1.5 최신 canonical·Linear와 구현 정합성을 재확인한 뒤 전체 task 완료 상태로 change를 archive하고 archive 후 strict validation을 통과한다.

## 2. PROD-541 사이드바 프로필 설정 진입점 비노출

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-541`
- `PROD-487` (사이드바 feedback footer의 독립 소유권)

**Deliverable**

설정 기능 공개 전 full Web sidebar, compact Web rail과 mobile drawer에 `프로필 설정` link가 시각·접근성 트리로 노출되지 않으며, `피드백 보내기`, `프로필`, `팔로워 요청`, 로그아웃과 기존 responsive navigation 동작은 그대로 유지된다.

**Guardrails**

- `SidebarNavigation.navItems`에서 `프로필 설정` item만 제거한다.
- `/menu` route와 같은 route를 사용하는 `프로필`·`팔로워 요청`을 변경하지 않는다.
- `/feedback`, feedback footer와 PROD-487·PR #390의 변경을 수정하지 않는다.
- 새 fixture·helper·harness, route, 대체 아이콘과 향후 dropdown을 추가하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 Shell Storybook의 full sidebar, compact rail과 mobile drawer interaction에 `프로필 설정` link 부재 및 유지 대상 진입점 assertion을 추가한다.
- 테스트 필요성: 공용 `navItems` 변경이 세 responsive surface에서 설정 link를 제거하고 다른 `/menu`·feedback·logout 진입점을 보존함을 직접 증명한다.
- 테스트 제외 범위: 새 Story, fixture, helper, harness, snapshot, route test와 관련 없는 shell interaction 확대.
- App test/check, 변경 파일 lint·Prettier, scoped/all OpenSpec strict validation, scope diff와 stack diff 검사를 통과한다.
- 최종 diff에서 PR #390의 feedback footer, API, DB, dependency와 migration 변경이 없는지 확인한다.

**실행 기록 (2026-07-30)**

- Web Storybook full sidebar 1280×900, compact rail 1024×900, mobile drawer 390×844: `프로필 설정` link는 시각·접근성 트리에 0건이고 `프로필`·`팔로워 요청`·`피드백 보내기`·로그아웃은 각 surface에 유지됨을 확인했다.
- 세 viewport 모두 가로 overflow가 없고, mobile drawer의 종료 버튼과 기존 응답형 navigation이 유지됨을 확인했다.
- Android·iOS native runtime과 VoiceOver·TalkBack: 미실행. Web Storybook 시각·접근성 관찰 및 자동화 결과와 구분한다.

- [x] 2.1 `SidebarNavigation.navItems`에서 `프로필 설정` row만 제거하고 feedback footer와 기존 비설정 menu 동작을 유지한다.
- [x] 2.2 기존 Shell Storybook에서 full·compact·mobile drawer의 `프로필 설정` link 부재와 유지 대상 진입점을 최소 assertion으로 검증한다.
- [x] 2.3 responsive viewport와 접근성 동작을 확인하고 Android·iOS runtime을 포함해 실행한 검증과 미실행 검증을 구분해 기록한다.
- [ ] 2.4 관련 자동화, formatting, scoped/all strict validation, scope diff와 PR #390 기준 stack diff 검사를 통과한다.
- [ ] 2.5 최신 canonical·Linear와 구현 정합성을 재확인한 뒤 change를 다시 archive하고 archive 후 strict validation을 통과한다.
