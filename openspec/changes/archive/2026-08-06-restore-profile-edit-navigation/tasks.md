## 1. PROD-660 sidebar Profile 편집 action correction

**Authority / Provenance**

- `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`
- `docs/design/profile-edit.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- Figma `WebSidebar` node `901:610`, `UserInfo` node `148:852`, `ProfileHero` edit button node `560:453`, `Button`
  primary/sm node `271:3`
- `PROD-660`

**Deliverable**

편집 가능한 selected Profile이 있는 인증 사용자가 full Web sidebar와 shared mobile drawer의 expanded Profile
요약에서 작은 노란 `편집` action으로 canonical `/profile-edit` route를 열 수 있다. 잘못 추가된 주요
navigation row는 제거되고 compact Web icon rail에는 대체 action이 없다.

**Guardrails**

- PROD-705가 제공한 selected Profile의 Local Instance와 viewer-relative Owner Membership을 eligibility source로
  재사용하고 새 권한 helper·정책이나 API를 만들지 않는다.
- Figma `UserInfo`의 future mini-profile cluster 아래 예약 좌표에 우측 정렬한 `72x32` primary/sm visual을
  사용하고 name·handle과 겹치지 않는다. production에 없는 thumbnail visual은 추가하지 않는다.
- Web `72x32`, iOS 최소 `44pt`, Android 최소 `48dp` input target과 accessible name `프로필 편집`을 제공한다.
- compact Web icon rail, mobile bottom tab, 우측 레일, 주요 navigation row, generic `/menu`, 실제 multi-profile
  switching, Profile edit form·API·DB와 공개 ProfileHero button을 변경하지 않는다.
- `add-local-profile-edit`와 다른 OpenSpec change의 tasks·archive ownership을 이전하거나 완료 처리하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/components/shell/shellLayout.test.ts`의 platform target·label 대비 unit,
  `apps/app/src/stories/Shell.stories.tsx`의 Relay-backed component interaction과
  `apps/web/e2e/navigation-scroll.e2e.ts`의 full·mobile drawer navigation 및 compact 비노출 흐름.
- 테스트 필요성: eligible/ineligible 노출, `/profile-edit` href, 위치·geometry, accessible name/current, platform
  target mapping, 고정 label 대비, drawer close와 주요 navigation·compact·bottom tab 비노출을 직접 증명한다.
- 테스트 제외 범위: 실제 multi-profile switching, Profile edit form/API/DB/Media 저장 조합, 광범위 snapshot,
  관련 없는 Shell 상태, Android·iOS 실제 runtime 자동화와 테스트 인프라 변경.

- [x] 1.1 Linear, canonical design docs와 active OpenSpec을 owner-confirmed Figma placement로 정렬한다.
- [x] 1.2 `SidebarNavigation`의 `UserRoundPen` navigation row와 그 eligibility selection을 제거한다.
- [x] 1.3 `ProfileSwitcher`의 eligible non-compact Profile 요약에 guarded `/profile-edit` action, exact current
      semantics와 platform별 input target을 구현한다.
- [x] 1.4 eligible/ineligible, full·drawer·compact 제외·active·geometry를 기존 Shell Storybook component test
      surface에서 직접 검증한다.
- [x] 1.5 full sidebar와 mobile drawer의 canonical navigation·drawer close 및 compact rail 비노출을 검증하는
      최소 Web E2E를 정렬한다.

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

PROD-660 correction과 자동화·Web runtime 증거가 canonical·Figma·Linear·OpenSpec 계약에 일치하고, 제품 owner의
Storybook screenshot 확인과 독립 리뷰·strict validation을 통과한 뒤 `restore-profile-edit-navigation` change가
자체 생명주기로 완료된다.

**Guardrails**

- Web 자동화, 공용 Native source mapping과 실제 Android·iOS runtime QA를 서로 다른 증거로 기록한다.
- correction screenshot을 제품 owner가 확인하기 전에는 PR을 Ready로 전환하지 않는다.
- 현재 change 전체가 완료되기 전에는 archive하지 않고, 완료 후에도 PROD-490의 `add-local-profile-edit` 또는
  다른 change를 함께 archive하지 않는다.
- 생성 Relay artifact는 commit하지 않으며 dependency, GraphQL schema, API, DB와 migration을 변경하지 않는다.

**Verification**

- Relay compiler, App TypeScript, targeted ESLint·Prettier, App unit·Storybook test와 targeted Web E2E를 실행한다.
- Web 1440/1024/390 viewport에서 keyboard focus·activation, accessible role/name/current state, pointer·touch target
  geometry와 mobile drawer close를 확인한다. 실행하지 못한 실제 screen reader 또는 Native runtime은 별도
  미검증으로 기록한다.
- 저장소 지침 비제공 독립 리뷰, 저장소 지침 기반 리뷰, canonical 문서와 코드 정합성 리뷰를 분리해 수행하고
  발견 사항을 해소한다.
- active change strict validation, canonical sync, archive 후 전체 strict validation과 formatting/diff check를
  통과한다.

- [x] 2.1 Relay·TypeScript·lint·format과 변경 동작을 직접 소유한 App unit·Storybook·Web E2E 검증을 통과시킨다.
- [x] 2.2 지원 Web viewport의 keyboard·접근성 semantics·pointer/touch geometry를 runtime에서 확인하고 correct
      Storybook screenshot을 제품 owner에게 제시한다.
- [x] 2.3 제품 owner가 screenshot을 확인한 뒤에만 Draft PR Ready 전환 여부를 결정한다.
- [x] 2.4 세 독립 리뷰 결과를 반영하고 승인 범위 밖 요구가 발견되면 구현을 멈춰 별도 판단으로 돌린다.
- [x] 2.5 최신 canonical·Figma·Linear와 구현·delta spec을 대조하고 active strict validation을 통과시킨다.
- [x] 2.6 모든 task와 검증이 완료되면 `restore-profile-edit-navigation`만 canonical spec에 동기화·archive하고
      archive 후 전체 strict validation과 diff check를 통과시킨다.
