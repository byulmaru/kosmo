## 1. PROD-660 반응형 Profile 편집 진입점

**Authority / Provenance**

- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/design/profile-edit.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-660`

**Deliverable**

편집 가능한 selected Profile이 있는 인증 사용자가 full Web sidebar, compact Web icon rail과 shared mobile
drawer의 `프로필 편집` 진입점으로 canonical `/profile-edit` route를 열 수 있다. 편집 권한이 없으면 해당
진입점은 노출되지 않는다.

**Guardrails**

- nullable `selectedProfileForEdit`을 eligibility source로 재사용하고 client-side Owner 판정이나 새 권한
  정책을 만들지 않는다.
- `프로필` 바로 다음에 `UserRoundPen`·`프로필 편집` 항목을 표시하고 기존 active state, guarded navigation과
  drawer close semantics를 유지한다.
- mobile bottom tab, 우측 레일, ProfileSwitcher action, generic `/menu`, Profile edit form·API·DB와 팔로워
  요청 진입점을 변경하지 않는다.
- `add-local-profile-edit`와 `add-incoming-follow-request-management`의 tasks·archive ownership을 이전하거나
  완료 처리하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/stories/Shell.stories.tsx`의 Relay-backed component interaction과
  `apps/web/e2e/navigation-scroll.e2e.ts`의 full·compact·mobile drawer navigation 흐름.
- 테스트 필요성: eligible/ineligible 노출, `/profile-edit` href, `프로필` 다음 순서, icon·accessible name,
  exact active state, mobile drawer close와 bottom tab 비노출을 직접 증명하고 기존 팔로워 요청·북마크 순서
  회귀를 막는다.
- 테스트 제외 범위: Profile edit form/API/DB/Media 저장 조합, 기존 Shell fixture 구조 밖의 새 공용 fixture/helper/harness, 광범위한 snapshot,
  관련 없는 Shell 상태, Android·iOS 실제 runtime 자동화와 테스트 인프라 변경.

- [x] 1.1 승인된 eligibility·surface·label·icon·순서·destination 계약을 shared navigation에 구현한다.
- [x] 1.2 eligible/ineligible 및 full·compact·drawer·active 상태를 기존 Shell Storybook component test
      surface에서 직접 검증한다.
- [x] 1.3 full·compact·mobile drawer에서 canonical navigation과 drawer close를 검증하는 최소 Web E2E를
      추가한다.

## 2. PROD-660 정합성·검증·OpenSpec 완료

**Authority / Provenance**

- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/design/profile-edit.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `memory/issue-openspec-workflow.md`
- `PROD-660`
- `PROD-490`

**Deliverable**

PROD-660 구현과 자동화·Web runtime 증거가 canonical·Linear·OpenSpec 계약에 일치하고, 독립 리뷰와 strict
validation을 통과한 뒤 `restore-profile-edit-navigation` change가 자체 생명주기로 완료된다.

**Guardrails**

- Web 자동화, 공용 Native source mapping과 실제 Android·iOS runtime QA를 서로 다른 증거로 기록한다.
- 현재 change 전체가 완료되기 전에는 archive하지 않고, 완료 후에도 PROD-490의 `add-local-profile-edit` 또는
  PROD-566의 `add-incoming-follow-request-management`를 함께 archive하지 않는다.
- 생성 Relay artifact는 commit하지 않으며 dependency, GraphQL schema, API, DB와 migration을 변경하지 않는다.

**Verification**

- Relay compiler, App TypeScript, targeted ESLint·Prettier, App unit·Storybook test와 targeted Web E2E를
  실행한다.
- Web 1440/1024/390 viewport에서 keyboard focus·activation, accessible role/name/current state, pointer·touch
  target geometry와 mobile drawer close를 확인한다. 실행하지 못한 실제 screen reader 또는 Native runtime은
  별도 미검증으로 기록한다.
- 독립 구현 리뷰에서 정확성, 회귀 위험과 검증 공백을 확인하고 발견 사항을 해소한다.
- active change strict validation, canonical sync, archive 후 전체 strict validation과 formatting/diff check를
  통과한다.

- [x] 2.1 Relay·TypeScript·lint·format과 변경 동작을 직접 소유한 App unit·Storybook·Web E2E 검증을
      통과시킨다.
- [ ] 2.2 지원 Web viewport의 keyboard·접근성 semantics·pointer/touch geometry를 runtime에서 확인하고
      Native 실제 runtime을 포함해 남은 검증 공백을 기록한다.
- [ ] 2.3 독립 구현 리뷰 결과를 반영하고 승인 범위 밖 요구가 발견되면 구현을 멈춰 별도 판단으로 돌린다.
- [x] 2.4 최신 canonical·Linear와 구현·delta spec을 대조하고 strict validation을 통과시킨다.
- [ ] 2.5 모든 task와 검증이 완료되면 `restore-profile-edit-navigation`만 canonical spec에 동기화·archive하고
      archive 후 전체 strict validation과 diff check를 통과시킨다.
