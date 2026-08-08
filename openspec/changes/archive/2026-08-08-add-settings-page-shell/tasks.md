## 1. PROD-685 Settings page shell과 상태 구조

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-685`

**Deliverable**

인증 사용자가 현재 승인된 두 settings entry를 root에서 구분하고, 공통 행 문법을 통해 외부 Account
destination과 내부 Profile detail로 이동할 수 있다.

**Guardrails**

- root에는 시각 label `계정 설정`인 Byulmaru ID 외부 entry와 `게시물 기본 공개 범위` 내부 entry를 이 순서로 직접 둔다.
- 항목 하나만 가진 `계정`·`프로필` category, 승인되지 않은 미래 placeholder와 범용 registry를 만들지 않는다.
- Kosmo 내부 Account route·UI·데이터 query·input·save 상태를 만들지 않는다.
- `SettingsItem`은 container-width 기반 row geometry와 필수 label·선택적 leading·description·trailing·
  selected presentation을 안정적인 조합 API로 제공한다. child의 interaction·접근성·조회·persistence
  semantics는 흡수하지 않는다.
- selected Profile이 없거나 Profile detail이 loading/error여도 다른 Profile의 값을 fallback으로 표시하지
  않는다. Profile detail은 자기 상태를 소유한다.

**Verification**

- root의 정확한 두 entry, 순서·accessible name·selected presentation과 SettingsItem width/reflow를 component
  test와 Storybook 상태로 검증한다.
- Profile detail의 selected/no-profile, loading/error/retry와 stale Profile 부재를 자기 상태 catalog에서
  검증한다.
- Account section에 Kosmo Account 데이터 loading·empty·save UI나 내부 Account route가 없는지 검증한다.

- [x] 1.1 Mobile Figma cell의 시각 규칙과 필수 label·선택적 leading·description·trailing·selected composition을 container 폭에 맞게 제공하는 presentational `SettingsItem`을 구현한다.
- [x] 1.2 Settings root에 시각 label `계정 설정`인 Byulmaru ID 외부 entry와 `게시물 기본 공개 범위` 내부 entry를 직접 구성하고 미래 category·placeholder·registry를 추가하지 않는다.
- [x] 1.3 Profile detail에 현재 Profile identity, selected/no-profile, loading·error·content와 기존 Profile 선택·생성 action을 연결하고 다른 Profile 값을 fallback으로 쓰지 않는다.
- [x] 1.4 root entry 순서·selected state, SettingsItem width/reflow와 Profile detail 상태의 component test·Storybook catalog를 추가한다.

## 2. PROD-685 Account 외부 진입점과 Profile 내부 기능 통합

**Authority / Provenance**

- `docs/design/settings.md`
- `PROD-685`
- `PROD-645`
- `PROD-667`

**Deliverable**

PROD-645의 Byulmaru ID Account 외부 진입점과 PROD-667의 Kosmo Profile 기본 게시 공개 범위가 canonical
Settings root/detail에 배치되고 각 자식 결과의 기존 동작·상태 소유권을 유지한다.

**Guardrails**

- PROD-645의 canonical URL·Web HTTPS external navigation·Android/iOS external link flow·오류 처리와
  PROD-667의 저장·권한·Relay·Composer 계약과 PROD-648 Backend를 공통 shell에서 재구현하지 않는다.
- Account entry를 Kosmo 내부 기능이나 selected Profile 범위로 표현하지 않고, Profile detail은 Kosmo 내부
  기능과 현재 Local Profile 대상을 명시한다.
- Account 데이터 query·input·save나 내부 Account settings route를 통합 결과로 추가하지 않는다.
- 두 child 결과가 통합 가능하기 전에는 navigation을 활성화하지 않는다. PROD-685는 완료 증거를 PROD-684에
  인계하고 change archive를 직접 소유하지 않는다.

**Verification**

- 최신 PROD-645·PROD-667 구현 결과와 Linear contract를 독립 대조한 뒤 Account 외부 진입점과 Profile 내부
  기능이 root/detail에서 계약대로 동작하는지 확인한다.
- Profile detail의 query·loading·error·retry가 자기 화면 경계에 남고 shell이 상태를 재구현하지 않는지
  검증한다.

- [x] 2.1 PROD-645·PROD-667과 Backend PROD-648의 최신 통합 surface, 완료 상태와 변경 댓글을 다시 확인하고 current branch의 통합 경계를 정렬한다.
- [x] 2.2 PROD-645의 Byulmaru ID Account 외부 진입점을 root의 첫 entry에 연결하고 Web HTTPS·Android/iOS 승인 external `Link` 계약을 보존한다.
- [x] 2.3 PROD-667 Profile 공개 범위 기능을 root의 두 번째 entry가 여는 detail에 연결하고 actor/Profile 데이터·권한 경계를 보존하되 구체적인 선택·저장 상호작용은 page shell contract로 고정하지 않는다.
- [x] 2.4 Profile detail의 selected/no-profile, loading·error·retry·성공 content와 actor 전환의 page-level 통합 검증을 추가한다.

## 3. PROD-685 Canonical route와 shell navigation

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/breakpoints.md`
- `docs/design/page-header.md`
- `PROD-685`

**Deliverable**

인증 사용자가 full·compact·mobile Web과 Android·iOS의 승인된 navigation surface에서 canonical Settings
route family를 열고, full master-detail 또는 one-pane drill-in으로 설정을 탐색한다.

**Guardrails**

- `/settings` root와 내부 detail은 기존 `(tabs)` 보호 route guard와 universal Expo route tree를 사용한다.
- full sidebar, compact icon rail과 mobile drawer에만 `설정`을 노출하고 bottom tab·right rail에는 중복하지
  않는다.
- full Web settings route family는 전역 sidebar를 유지하고 일반 RightRail을 숨긴 center+right wide workspace를
  사용한다. 다른 route의 center/right rail은 변경하지 않는다.
- full `/settings`는 Profile detail을 기본 선택한다. compact/mobile/native `/settings`는 root 목록부터
  표시하고 내부 detail에 back navigation을 제공한다.
- mobile Web root/detail header, Native·compact route header와 full master/detail pane heading을 중복하지
  않는다.
- route와 통합 가능한 page content가 함께 준비된 slice에서만 navigation을 노출한다.
- Web forward navigation의 document-top 정책과 browser history restoration을 유지한다.

**Verification**

- 보호 route guest redirect, root/detail deep link, full·compact·drawer href·page-current·drawer close와 bottom
  tab 진입점 중복 부재를 unit/component test로 검증한다.
- full workspace master/detail·RightRail visibility와 다른 route rail 유지, compact/mobile/native root-first·
  back·heading 소유권을 검증한다.
- mobile Web forward navigation과 browser back/forward scroll restoration을 실제 browser에서 확인한다.

- [x] 3.1 `/settings` root와 Profile detail을 Android·iOS·Web이 공유하는 보호 route family로 연결하고 guest·session loading/error guard 동작을 유지한다.
- [x] 3.2 full sidebar, compact icon rail과 mobile drawer에 `/settings` 진입점·route-family page-current·drawer close를 연결하되 bottom tab에 중복하지 않는다.
- [x] 3.3 full Web에서 일반 RightRail을 숨기고 center+right에 약 320px master+flex detail workspace와 Profile 기본 선택을 제공하며, 다른 route의 center/right rail 계약을 유지한다.
- [x] 3.4 compact/mobile/native에서 root 목록부터 시작하고 Profile detail의 back navigation과 root/detail heading을 중복 없이 제공한다.
- [x] 3.5 route parity·보호 guard·deep link/back, pane visibility, surface navigation·header와 Web forward/history 회귀 테스트를 추가한다.
  - 2026-08-08: Android·iOS 공용 route와 `index` anchor, 보호 guard, pane/header/navigation 계약은 unit·Storybook으로 고정하고 Web deep link/back/forward는 Playwright로 검증했다. 실제 Native route stack 실행은 4.3에 남긴다.

## 4. PROD-685 페이지 수준 접근성·플랫폼 검증과 완료 증거

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-685`
- `PROD-727`

**Deliverable**

자동화된 Web page-level 검증과 Figma 정렬 증거가 남고 구현과 canonical·Linear·OpenSpec이 일치한다. 실제
Web 보조기술과 Android·iOS runtime QA는 PROD-727에 명시적으로 인계한다.

**Guardrails**

- Web 정적/Storybook 결과를 Android·iOS runtime 또는 전체 WCAG 2.2 AA 적합성 증거로 일반화하지 않는다.
- PROD-645의 외부 navigation과 PROD-667의 Profile 세부 기능 검증을 반복하지 않고 route·navigation·pane·
  소유 경계·정보 구조 통합만 검증한다.
- PROD-685는 page-level 검증과 Figma 후속 정렬 증거를 PROD-684에 인계한다. PROD-684가 최종 통합·정합성
  확인과 archive를 소유한다.
- PROD-727의 실제 Web 보조기술과 Android·iOS runtime QA는 이 change archive를 차단하지 않으며, 실제 결함은
  별도 구현 이슈와 PR로 추적한다.

**Verification**

- Relay compiler, TypeScript, 관련 unit/component test, Storybook test·static build·a11y와 OpenSpec strict
  validation 결과를 기록한다.
- Web keyboard·screen reader·reflow와 Android TalkBack·font scaling·48dp, iOS VoiceOver·font scaling·44pt
  target을 실제 실행한 범위와 미실행 범위로 나눠 기록한다.
- 최신 canonical 문서, PROD-685·PROD-684·PROD-645·PROD-667·PROD-648 본문·관계·계약 변경 댓글과 구현 diff를 handoff 전에 다시
  대조한다.

- [x] 4.1 Relay compiler, TypeScript, 관련 unit/component test와 Storybook test·static build·a11y를 통과시킨다.
- [x] 4.2 mobile·compact·full Web에서 master/detail 또는 root/detail의 heading·selected state·reflow, forward/history와 외부 Account/내부 Profile 조립을 자동화로 확인하고, 기존 frames를 보존한 새 PROD-685 Figma frames와 구현을 정렬한다.
  - 2026-08-08: Storybook·Playwright에서 Settings deep link/back/forward와 responsive 통합을 확인했고, 기존 frames를 보존한 PROD-685 Figma frames 5개를 추가했다. 실제 keyboard traversal·screen reader·browser zoom과 외부 destination runtime은 PROD-727로 인계했다.
- [x] 4.3 실제 Web 보조기술과 Android·iOS runtime QA의 플랫폼·환경·증거·결함 후속 조치를 별도 자식 이슈로 인계하고 parent OpenSpec archive 차단 여부를 기록한다.
  - 2026-08-08: PROD-727을 PROD-684의 Backlog 자식으로 생성해 Web keyboard·screen reader·zoom과 Android·iOS drawer/navigation·font scaling·screen reader·touch target QA를 인계했다. 실제 runtime을 수행했다고 주장하지 않으며 이 후속 QA는 archive를 차단하지 않는다.
- [x] 4.4 최신 canonical·Linear authority와 구현·delta spec 정합성을 다시 확인하고 `openspec validate add-settings-page-shell --strict`를 통과시켜 PROD-684에 완료·archive 증거를 인계한다.
  - 2026-08-08: PROD-684·PROD-685와 자식 계약, 비차단 runtime QA 자식 PROD-727을 다시 확인했다. strict validation 통과 뒤 `settings-page-shell` 7개 requirement를 canonical spec으로 추가하고 `universal-expo-client`·`web-app-shell` 변경을 동기화해 archive했다.
