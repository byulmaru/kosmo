## 1. PROD-541 알림 화면 설정 진입점 비노출

이 section은 2026-07-29에 notification-only slice로 구현·검증·archive했던 범위와 실행 증거를 기록한다. 2026-07-30 범위 재확인으로 추가된 현재 sidebar·route 구현 경계는 section 2가 소유한다.

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
- [x] 1.5 당시 최신 canonical·Linear와 notification-only 구현 정합성을 재확인하고 archive 후 strict validation을 통과했다.

## 2. PROD-541 준비되지 않은 사이드바 진입점과 generic menu route 비노출

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-541`
- `PROD-487` (사이드바 feedback footer의 독립 소유권)
- `PROD-566` (받은 요청 UI와 `UserRoundPlus` 진입점 복원)

**Deliverable**

full Web sidebar, compact Web rail과 mobile drawer에 `프로필 설정`과 `팔로워 요청` link가 시각·접근성 트리로 노출되지 않고 generic `/menu` placeholder route가 등록되지 않는다. `피드백 보내기`, 실제 Profile route, `북마크`, 로그아웃과 기존 responsive navigation 동작은 유지된다.

**Guardrails**

- `SidebarNavigation`에서 `프로필 설정`과 `팔로워 요청` item을 제거하고 literal source comment나 dead code로 남기지 않는다.
- `프로필` item은 선택한 Profile의 canonical route 또는 기존 no-profile button 동작만 사용하며 `/menu` sentinel을 남기지 않는다.
- 사용하지 않는 `UserRoundPlus` import는 제거하되 복원 icon 이름은 PROD-566에 보존한다.
- `/feedback`, feedback footer와 PROD-487·PR #390의 변경을 수정하지 않는다.
- `프로필`, `북마크`, 로그아웃과 drawer close·active semantics를 유지한다.
- 팔로우 요청의 pending 저장 모델, GraphQL connection·mutation, 보낸 요청의 `요청됨`·취소 동작을 변경하지 않는다.
- `/menu` 직접 접근을 위한 새 redirect나 전용 404 화면을 추가하지 않는다.
- 새 fixture·helper·harness, unrelated route test와 관련 없는 shell interaction을 추가하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 Shell Storybook의 full sidebar, compact rail과 mobile drawer interaction에서 `프로필 설정`·`팔로워 요청` 부재와 유지 대상 진입점을 검증하고, `apps/web/e2e/auth-routes.e2e.ts`의 positive `/menu` smoke를 제거한다.
- 테스트 필요성: 공용 navigation 변경이 세 responsive surface에서 두 준비되지 않은 link를 제거하고 실제 동작하는 profile·bookmark·feedback·logout을 보존하며, 삭제된 route를 성공 화면으로 검증하지 않음을 직접 증명한다.
- 테스트 제외 범위: 새 Story, fixture, helper, harness, snapshot, 특정 framework 404·redirect expectation, feedback E2E 변경과 관련 없는 shell interaction 확대.
- `feedback.e2e.ts`의 `/feedback` 화면에서 legacy menu 소개 문구 부재 assertion은 route 삭제 후에도 유효하므로 유지한다.
- Web Storybook full 1280×900, compact 1024×900, mobile drawer 390×844에서 navigation geometry, overflow, link semantics와 drawer close를 관찰한다.
- Expo generated route/typecheck에서 `/menu`가 등록되지 않음을 확인하고 생성 artifact가 tracked 범위에 불필요하게 포함되지 않게 한다.
- App test/check, 관련 Web E2E, 변경 파일 lint·Prettier, scoped/all OpenSpec strict validation, `git diff --check`, scope diff와 PR #390 기준 stack diff 검사를 통과한다.
- Android·iOS runtime, VoiceOver·TalkBack을 실행했는지 자동화·Web 관찰과 구분해 기록한다.

**이전 범위 실행 기록 (2026-07-30, superseded baseline)**

- Web Storybook full sidebar 1280×900, compact rail 1024×900, mobile drawer 390×844에서 `프로필 설정`만 비노출하고 `팔로워 요청`을 유지했던 이전 범위를 확인했다.
- 세 viewport 모두 가로 overflow가 없고 mobile drawer 종료 버튼과 기존 responsive navigation이 유지됨을 확인했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행이었다. 새 final scope에서 다시 구분해 기록한다.

**TDD RED 실행 기록 (2026-07-30)**

- Shell Storybook의 full sidebar, compact rail과 mobile drawer assertion을 `팔로워 요청` 비노출 계약으로 먼저 변경하고 Web auth route positive smoke에서 `/menu`를 제거했다.
- production 변경 전 `CI=true pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/Shell.stories.tsx`: 31개 중 28개 통과, 세 surface의 실제 `팔로워 요청 → /menu` link만 원인으로 3개 실패해 새 검증이 기존 동작을 포착함을 확인했다.
- production 최소 변경 후 같은 focused suite가 31/31 통과했고 App Relay compile·TypeScript check와 Web TypeScript check가 통과했다.

**최종 viewport·route 실행 기록 (2026-07-30)**

- Web Storybook full sidebar 1280×900, compact rail 1024×900, mobile drawer 390×844에서 `프로필 설정`·`팔로워 요청` 비노출과 실제 Profile·북마크·피드백·로그아웃 접근성 의미를 확인했다.
- 세 viewport 모두 document horizontal overflow가 없었고, mobile drawer는 `/menu` href 없이 닫기 control로 정상 종료됐다.
- Expo Web export와 BFF를 포함한 `auth-routes.e2e.ts`가 24/24 통과했으며 source route와 generated route에서 `/menu` 등록이 없음을 확인했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web 관찰 및 자동화 결과와 구분한다.

- [x] 2.1 기존 Shell Storybook과 Web auth route 검증을 새 비노출·route 제거 계약에 맞춰 먼저 변경하고 최소 실패 증거를 확인한다.
- [x] 2.2 `SidebarNavigation`의 두 준비되지 않은 item, profile `/menu` sentinel과 사용하지 않는 icon import를 제거하고 generic `/menu` route를 삭제한다.
- [x] 2.3 focused 자동화와 full·compact·mobile Web viewport에서 유지 대상, 접근성, route 등록과 responsive 동작을 확인하고 Android·iOS 미실행 검증을 구분한다.
- [ ] 2.4 관련 자동화, formatting, scoped/all strict validation, scope diff와 PR #390 기준 stack diff 검사를 통과한다.
- [ ] 2.5 parent `add-web-feedback-slack-delivery` archive와 canonical requirement를 재확인하고 PROD-219의 stale `/menu` smoke ownership을 기록한 뒤 child change를 archive해 archive 후 strict validation을 통과한다.
