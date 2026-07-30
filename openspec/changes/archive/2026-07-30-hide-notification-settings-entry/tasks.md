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

## 2. PROD-541 준비되지 않은 사이드바 진입점 비노출과 shell 정렬

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-541`
- `PROD-487` (사이드바 feedback footer의 독립 소유권)
- `PROD-566` (받은 요청 UI와 `UserRoundPlus` 진입점 복원)

**Deliverable**

full Web sidebar, compact Web rail과 mobile drawer에 `프로필 설정`과 `팔로워 요청` link가 시각·접근성 트리로 노출되지 않고 generic `/menu` placeholder route가 등록되지 않는다. full/mobile ProfileSwitcher nickname은 별도 하향 보정 없이 중심에 정렬되고 `피드백 보내기`는 Lucide `Mail` glyph를 사용한다. 개인정보 처리방침은 full Web right rail 최하단에서 `/privacy`로 연결되고 compact icon rail·mobile drawer에는 표시되지 않는다. mobile drawer의 중복 글쓰기는 제거하되 하단 5탭과 compact rail의 글쓰기는 유지하고, `LogOut` glyph는 주변 navigation과 같은 2px stroke를 사용한다. 실제 Profile route, `북마크`, feedback label·link·동작, 로그아웃과 기존 responsive navigation 동작은 유지된다.

**Guardrails**

- `SidebarNavigation`에서 `프로필 설정`과 `팔로워 요청` item을 제거하고 literal source comment나 dead code로 남기지 않는다.
- `프로필` item은 선택한 Profile의 canonical route 또는 기존 no-profile button 동작만 사용하며 `/menu` sentinel을 남기지 않는다.
- 사용하지 않는 `UserRoundPlus` import는 제거하되 복원 icon 이름은 PROD-566에 보존한다.
- feedback footer는 `Settings` glyph만 `Mail`로 교체하며 label, `/feedback` destination, active·drawer close·접근성 semantics와 전달 동작을 수정하지 않는다.
- ProfileSwitcher의 nickname 하향 보정만 제거하고 avatar·chevron·trigger height와 compact rail geometry를 수정하지 않는다.
- `프로필`, `북마크`, 로그아웃과 drawer close·active semantics를 유지한다.
- 팔로우 요청의 pending 저장 모델, GraphQL connection·mutation, 보낸 요청의 `요청됨`·취소 동작을 변경하지 않는다.
- `/menu` 직접 접근을 위한 새 redirect나 전용 404 화면을 추가하지 않는다.
- 개인정보 처리방침 본문·공개 route·landing link를 변경하지 않고 인증 후 link는 full Web right rail 최하단에만 둔다. compact·mobile에는 표시하지 않는다.
- 가입·로그인 온보딩 안의 추가 개인정보 처리방침 진입점은 구현하지 않는다.
- mobile drawer에서만 글쓰기를 제거하고 하단 5탭과 compact Web compose link는 유지한다.
- `LogOut` glyph stroke만 2px로 보강하고 로그아웃 label·accessible name·target geometry·동작은 바꾸지 않는다.
- 새 fixture·helper·harness, unrelated route test와 관련 없는 shell interaction을 추가하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 Shell Storybook의 full sidebar, compact rail과 mobile drawer interaction에서 `프로필 설정`·`팔로워 요청` 부재, full Web 개인정보 처리방침 진입과 compact·mobile 비노출, mobile drawer 글쓰기 부재, 하단 탭·compact compose 유지, 2px logout glyph와 기존 유지 대상, full/mobile nickname 중심 정렬을 검증한다. `apps/web/e2e/auth-routes.e2e.ts`의 인증된 full shell `/privacy` navigation은 유지한다.
- 테스트 필요성: 공용 navigation 변경이 세 responsive surface에서 두 준비되지 않은 link를 제거하고 실제 동작하는 profile·bookmark·feedback·logout을 보존하며, full/mobile nickname의 별도 하향 offset을 방지하고 삭제된 route를 성공 화면으로 검증하지 않음을 직접 증명한다.
- 테스트 제외 범위: 새 Story, fixture, helper, harness, snapshot, 특정 framework 404·redirect expectation, feedback E2E 변경과 관련 없는 shell interaction 확대.
- `feedback.e2e.ts`의 `/feedback` 화면에서 legacy menu 소개 문구 부재 assertion은 route 삭제 후에도 유효하므로 유지한다.
- Web Storybook full 1280×900, compact 1024×900, mobile drawer 390×844에서 navigation geometry, overflow, full 개인정보 처리방침 link geometry와 compact·mobile 비노출, mobile drawer 글쓰기 부재, logout glyph와 drawer close를 관찰한다.
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

**정렬·glyph TDD RED 실행 기록 (2026-07-30)**

- 기존 Shell Storybook의 feedback current-state에 Lucide `Mail` path assertion을 추가하고 full/mobile ProfileSwitcher의 nickname·chevron 중심 차이 기대값을 6px에서 0px로 먼저 변경했다.
- production 변경 전 같은 focused suite는 31개 중 28개 통과했고, 실제 `Settings` path 1건과 full/mobile의 실제 6px offset 2건만 원인으로 실패해 새 검증이 기존 동작을 정확히 포착함을 확인했다.

**정렬·glyph 최종 실행 기록 (2026-07-30)**

- production 최소 변경 후 focused Shell Storybook은 31/31 통과했다. 기존 ProfileSwitcher interaction의 React `act(...)`·Suspense 경고는 남았지만 실패는 없었다.
- `CI=true pnpm --filter @kosmo/app test`: Relay compile·TypeScript, unit 59/59, Storybook static build와 Storybook 175/175 통과.
- Web Storybook full 1280×900과 mobile drawer 390×844에서 nickname·chevron의 trigger 중심 정렬과 `Mail` glyph를 확인했고, compact 1024×900에서도 `Mail` glyph와 기존 rail geometry가 유지됨을 확인했다.
- 변경 파일 ESLint·Prettier, scoped strict와 전체 OpenSpec strict 51/51, `git diff --check`를 통과했다.
- 최신 parent PR #390 head `e9c9f0b9`와 child merge-base `cbd4b5ba` 사이의 parent-only 변경은 parent OpenSpec·운영 문서에 한정됐다. merge-base 기준 child scope diff에 API·DB·dependency·migration·`.superpowers`·`docs/superpowers` 변경이 없음을 확인했다.
- Sol medium 독립 리뷰에서 full/mobile에 존재하지 않는 avatar까지 중심 정렬 대상으로 기록한 P2 문서 불일치를 발견해 Linear·OpenSpec을 실제 구조에 맞게 정정했다. 후속 재리뷰는 finding 없이 승인 가능 판정을 반환했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web Storybook 관찰 및 자동화 결과와 구분한다.

**최종 viewport·route 실행 기록 (2026-07-30)**

- Web Storybook full sidebar 1280×900, compact rail 1024×900, mobile drawer 390×844에서 `프로필 설정`·`팔로워 요청` 비노출과 실제 Profile·북마크·피드백·로그아웃 접근성 의미를 확인했다.
- 세 viewport 모두 document horizontal overflow가 없었고, mobile drawer는 `/menu` href 없이 닫기 control로 정상 종료됐다.
- Expo Web export와 BFF를 포함한 `auth-routes.e2e.ts`가 24/24 통과했으며 source route와 generated route에서 `/menu` 등록이 없음을 확인했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web 관찰 및 자동화 결과와 구분한다.

**최신 PR #390 재스택·자동화 실행 기록 (2026-07-30)**

- Parent PR #390의 최신 head `cbd4b5ba` 위로 네 child commit만 재스택했고, 이전 parent `4524bb41` 기준 `git range-diff`에서 네 commit 모두 동일함(`=`)을 확인했다.
- `CI=true pnpm --filter @kosmo/app test`: Relay compile·TypeScript, unit 59/59, Storybook build와 Storybook 175/175 통과.
- 격리 DB와 Expo Web export·API·OIDC·BFF를 포함한 `auth-routes.e2e.ts`: 24/24 통과.
- 변경 파일 ESLint·Prettier, scoped strict와 전체 OpenSpec strict 51/51, `git diff --check`를 통과했다.
- `origin/PROD-487...HEAD` scope diff에 API·DB·dependency·migration·`.superpowers`·`docs/superpowers` 변경이 없음을 확인했다.

**Parent PR #390 merge 이후 재스택·자동화 실행 기록 (2026-07-30)**

- PR #390 merge 후 기존 parent boundary `cbd4b5ba` 위의 child commit 6개만 최신 `origin/main` `217dfafa` 위로 재스택했다. 이전·이후 `git range-diff`에서 6개 commit이 모두 동일함(`=`)을 확인했고, PR diff는 PROD-541 소유 16개 파일로 정리됐다.
- 사용자 결정에 따라 full Web sidebar와 mobile Web drawer의 ProfileSwitcher nickname·chevron을 trigger 수직 중심에 두도록 `docs/design/breakpoints.md`의 기존 6px 광학 보정 계약을 갱신했다.
- active change archive 전에 canonical spec을 일부만 선반영하지 않도록 notification 계약은 delta spec에 유지하고 `openspec/specs/notification/spec.md`는 현재 canonical 상태로 복원했다.
- `CI=true pnpm --filter @kosmo/app test`: Relay compile·TypeScript, unit 59/59, Storybook static build와 Storybook 175/175 통과.
- scoped strict와 전체 OpenSpec strict 52/52, `git diff --check`를 통과했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web Storybook 관찰 및 자동화 결과와 구분한다.

**개인정보 처리방침·mobile drawer·logout 이전 실행 기록 (2026-07-30, privacy 배치 superseded baseline)**

- PR #412 human review에 따라 child delta의 parent-owned `Universal shell feedback navigation` MODIFIED requirement와 parent-first archive gate를 제거했다. `Mail` glyph는 child sidebar requirement에 두고 child archive를 PROD-487 production smoke와 분리했다.
- active `add-web-openpanel-product-analytics`의 개인정보 처리방침 requirement·design·decision·task를 landing + responsive shell 계약으로 정렬하고 production acceptance·archive ownership은 PROD-575에 유지했다. scoped strict 2개와 전체 OpenSpec strict 56/56이 통과했다.
- Storybook assertion을 production 코드보다 먼저 변경한 focused RED는 33개 중 29개 통과, 4개 실패였다. 실제 `LogOut` 1.5px 2건과 mobile drawer의 실제 중복 글쓰기 2건만 원인으로 실패해 새 계약이 기존 동작을 포착했다. 개인정보 처리방침 assertion은 앞선 실패 뒤에 있어 RED에서 실행되지 않았고 GREEN에서 검증했다.
- 최소 구현 후 focused Shell Storybook 33/33, App TypeScript·Relay와 unit 77/77, Storybook build와 전체 Storybook 208/208, Web TypeScript check, 변경 파일 ESLint·Prettier가 통과했다. 기존 ProfileSwitcher `act(...)`·Suspense console warning과 의도된 error-boundary fixture log는 실패가 아니다.
- 격리 DB와 Expo Web export·API·OIDC·BFF를 포함한 `auth-routes.e2e.ts`가 26/26 통과했다. 인증 후 `/menu` smoke는 1440px full shell의 `개인정보 처리방침 → /privacy` navigation으로 교체됐다.
- 실제 Storybook 1280×900에서 right rail 좌하단 muted text link, 1024×900에서 compact rail 하단 `FileText` link와 유지된 `/compose`, 390×844에서 drawer 하단 muted text link·drawer 글쓰기 부재·하단 탭 글쓰기 1개를 확인했다. 세 viewport 모두 document horizontal overflow가 없었고 compact·mobile `LogOut` stroke는 2px였다.
- `git diff --check`와 scope diff를 통과했고 API·DB·dependency·migration·`.superpowers`·`docs/superpowers` 변경이 없다. Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다.

**full-only 개인정보 처리방침 TDD 실행 기록 (2026-07-30)**

- Shell Storybook assertion을 production 코드보다 먼저 compact·mobile 비노출과 full rail 하단 8px 이하 geometry 계약으로 변경했다.
- 샌드박스의 IPv6 listen `EPERM`으로 첫 실행은 테스트 0개에서 중단됐으며, 동일 명령을 로컬 포트 허용 환경에서 재실행한 RED는 33개 중 29개 통과, 4개 실패였다. compact 1건과 drawer/mobile 2건은 실제 `/privacy` link가 남아 있었고 full 1건은 rail 하단 간격 16px가 새 8px 기준을 초과해 실패했다.
- `SidebarNavigation`의 compact·drawer 개인정보 처리방침 block과 `FileText` import를 제거하고 `RightRailPrivacyLink` bottom margin을 `spacing.sm`으로 줄인 뒤 focused Shell Storybook 33/33이 통과했다.

**full-only 개인정보 처리방침 최종 실행 기록 (2026-07-30)**

- `CI=true pnpm --filter @kosmo/app test`: Relay compile·TypeScript, unit 77/77, Storybook static build와 Storybook 208/208 통과. 기존 ProfileSwitcher `act(...)`·Suspense warning과 의도된 오류 fixture log는 실패가 아니다.
- 격리 DB schema 준비와 Expo Web export·API·OIDC·BFF를 포함한 `auth-routes.e2e.ts`가 26/26 통과했다. 667px mobile drawer에서 중복 글쓰기·개인정보 처리방침 비노출과 feedback 유지를 확인하고, 메뉴 축소 후에도 480px 높이에서는 drawer 내부 scroll이 유지됨을 확인했다.
- 실제 Storybook full 1280×900에서 right rail 최하단의 muted `/privacy` link, compact 1024×900에서 개인정보 처리방침 비노출과 compose·feedback·logout 유지, mobile drawer 390×844에서 개인정보 처리방침·중복 글쓰기 비노출과 feedback·logout 유지를 확인했다.
- Web TypeScript check, 변경 파일 ESLint·Prettier, scoped strict 2개와 전체 OpenSpec strict 56/56, `git diff --check`와 scope diff를 통과했다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web Storybook·Web E2E 관찰 및 자동화 결과와 구분한다.

**compact 로그아웃 중심 정렬 실행 기록 (2026-07-30)**

- Compact Sidebar Storybook에 로그아웃과 feedback target의 실제 수평 중심선 비교를 production 변경보다 먼저 추가했다. focused RED는 33개 중 32개 통과했으며 로그아웃 중심 40px, feedback 중심 30px의 실제 10px 차이만 원인으로 실패했다.
- compact `LogoutControl` outer wrapper의 폭만 inner target과 같은 44px로 제한했다. 같은 focused suite가 33/33 통과했고, 로그아웃 icon·target geometry, feedback 위치와 full/mobile style은 변경하지 않았다.
- `CI=true pnpm --filter @kosmo/app test`: Relay compile·TypeScript, unit 77/77, Storybook static build와 Storybook 208/208 통과. 기존 ProfileSwitcher `act(...)`·Suspense warning과 의도된 오류 fixture log는 실패가 아니다.
- 실제 Storybook 1024×900에서 로그아웃과 feedback target은 모두 `centerX: 202px`였고 로그아웃 target은 44×44를 유지했다. document `clientWidth`와 `scrollWidth`는 모두 1024px로 가로 overflow가 없었다.
- 변경 파일 ESLint·Prettier, scoped strict와 전체 OpenSpec strict 56/56, `git diff --check`를 통과했다. route·data 동작 변경이 없어 격리 Web E2E는 다시 실행하지 않았으며 직전 full-only 범위의 26/26 결과와 구분한다.
- Android·iOS native runtime과 VoiceOver·TalkBack은 미실행했다. Web Storybook 관찰 및 자동화 결과와 구분한다.

**Archive 실행 기록 (2026-07-30)**

- 최신 canonical design 문서, PROD-541 본문·관계·댓글과 모든 Active decision을 재대조했으며 Blocked 또는 미해결 Upstream Change Required 결정이 없음을 확인했다.
- `notification` 1개, `universal-expo-client` 1개, `web-app-shell` 2개의 requirement를 수정하고 `web-app-shell` requirement 2개를 추가한 뒤 `hide-notification-settings-entry`를 `2026-07-30-hide-notification-settings-entry`로 archive했다.
- archive 후 전체 OpenSpec strict validation 55/55와 `git diff --check`를 통과했다.

- [x] 2.1 기존 Shell Storybook과 Web auth route 검증을 새 비노출·route 제거 계약에 맞춰 먼저 변경하고 최소 실패 증거를 확인한다.
- [x] 2.2 `SidebarNavigation`의 두 준비되지 않은 item, profile `/menu` sentinel과 사용하지 않는 icon import를 제거하고 generic `/menu` route를 삭제한다.
- [x] 2.3 focused 자동화와 full·compact·mobile Web viewport에서 유지 대상, 접근성, route 등록과 responsive 동작을 확인하고 Android·iOS 미실행 검증을 구분한다.
- [x] 2.4 관련 자동화, formatting, scoped/all strict validation, scope diff와 PR #390 기준 stack diff 검사를 통과한다.
- [x] 2.5 기존 Shell Storybook의 full/mobile nickname geometry assertion을 중심 기준으로 먼저 변경하고 production 변경 전 최소 실패 증거를 확인한다.
- [x] 2.6 ProfileSwitcher nickname의 하향 보정을 제거하고 feedback footer의 `Settings` glyph만 `Mail`로 교체한다.
- [x] 2.7 focused 자동화와 full·compact·mobile Web viewport에서 정렬·glyph·유지 동작을 확인하고 formatting, scoped/all strict validation, scope diff와 PR #390 기준 stack diff를 통과한다.
- [x] 2.8 PR #412 human review에 따라 parent feedback requirement와 archive lifecycle을 child에서 분리하고, active OpenPanel 개인정보 처리방침 requirement를 responsive shell 계약으로 정렬해 strict validation을 통과한다.
- [x] 2.9 기존 Shell Storybook과 Web auth route를 개인정보 처리방침 responsive 진입점, mobile drawer 글쓰기 부재와 logout 2px glyph 계약에 맞춰 먼저 변경하고 production 변경 전 최소 실패 증거를 확인한다.
- [x] 2.10 `RightRail`·`UniversalShell`·`SidebarNavigation`·`LogoutControl`에 responsive 개인정보 처리방침 진입점, mobile drawer compose 제거와 logout glyph weight 보강을 최소 변경으로 구현한다.
- [x] 2.11 focused·전체 자동화와 full·compact·mobile Web viewport에서 새 동작과 유지 대상을 검증하고 formatting, scoped/all strict validation, `git diff --check`와 scope diff를 통과한다.
- [x] 2.12 기존 Shell Storybook을 full Web 개인정보 처리방침 진입과 compact·mobile 비노출 계약에 맞춰 먼저 변경하고 production 변경 전 최소 실패 증거를 확인한다.
- [x] 2.13 `RightRail` 개인정보 처리방침 link를 viewport 하단에 더 가깝게 옮기고 `SidebarNavigation`의 compact·drawer 개인정보 처리방침 진입점과 사용하지 않는 `FileText` import를 제거한다.
- [x] 2.14 focused·전체 자동화와 full·compact·mobile Web viewport에서 새 동작과 유지 대상을 검증하고 formatting, scoped/all strict validation, `git diff --check`와 scope diff를 통과한다.
- [x] 2.15 Compact Sidebar Storybook에 로그아웃과 feedback target의 실제 수평 중심선 비교를 먼저 추가하고 production 변경 전 10px offset만 원인인 최소 실패 증거를 확인한다.
- [x] 2.16 compact `LogoutControl` outer wrapper를 44px로 제한해 target·glyph를 다른 compact footer control과 같은 중심선에 두고 target geometry·feedback 위치·동작을 유지한다.
- [x] 2.17 focused·전체 자동화와 1024px Web viewport에서 compact 로그아웃 정렬 및 유지 대상을 검증하고 formatting, scoped/all strict validation과 `git diff --check`를 통과한다.
- [x] 2.18 PROD-541의 전체 선언 범위와 검증이 완료됐음을 확인한 뒤 child change archive 및 archive 후 strict validation을 수행한다.
