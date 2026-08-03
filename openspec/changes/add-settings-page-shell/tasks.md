## 1. PROD-653 Settings page shell과 상태 구조

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `PROD-653`

**Deliverable**

인증 사용자가 Account와 현재 Local Profile 설정의 소유 단위, 현재 Profile 대상과 대상 없음 상태를 하나의
settings page 구조에서 명확히 이해할 수 있다.

**Guardrails**

- `계정 설정`과 `프로필 설정`을 이 순서의 독립 section으로 유지하고 하나의 저장 단위로 합치지 않는다.
- selected Profile이 없더라도 Account section을 유지하고 다른 Profile의 값을 fallback으로 표시하지 않는다.
- 승인되지 않은 미래 설정 category를 disabled item이나 placeholder로 노출하지 않는다.
- route가 공통 Profile identity를 소유하고 child section은 자기 데이터·pending·오류 상태를 소유한다.

**Verification**

- selected Profile 있음·없음, loading, route error, Account-only error와 Profile-only error 상태에서 heading,
  identity, 정상 section 유지와 재시도를 component test와 Storybook 상태로 검증한다.
- Relay actor/Profile 전환 뒤 이전 identity와 control data가 새 대상 아래에 표시되지 않는지 검증한다.

- [ ] 1.1 단일 `설정` heading 아래 Account/Profile section과 현재 Profile identity를 제공하는 공통 page shell을 구현한다.
- [ ] 1.2 selected Profile이 없을 때 Account section을 유지하고 기존 Profile 선택·생성 flow로 연결하는 Profile empty state를 구현한다.
- [ ] 1.3 route-level loading·error와 독립 section loading·error가 소유 경계를 유지하고 재시도 가능한 상태를 구현한다.
- [ ] 1.4 selected/no-profile, loading·error, 긴 Profile identity와 작은 화면 상태의 component test·Storybook catalog를 추가한다.

## 2. PROD-653 Account와 Profile 자식 기능 통합

**Authority / Provenance**

- `docs/design/settings.md`
- `PROD-653`
- `PROD-645`
- `PROD-648`

**Deliverable**

PROD-645의 Account 설정과 PROD-648의 Profile 기본 게시 공개 범위가 canonical settings page의 올바른 section에
함께 배치되고 각 기능의 기존 동작·상태 소유권을 유지한다.

**Guardrails**

- PROD-645의 외부 이동과 오류 처리, PROD-648의 저장·권한·GraphQL·DB·Relay·Composer 계약을 공통 shell에서
  재구현하지 않는다.
- Account 기능을 selected Profile 범위로 표현하지 않고 Profile 기능은 현재 Local Profile 대상을 명시한다.
- 두 child 결과가 통합 가능하기 전에는 navigation 활성화, PROD-653 완료와 change archive를 진행하지 않는다.

**Verification**

- 최신 PROD-645·PROD-648 구현 결과와 Linear contract를 독립 대조한 뒤 두 section에서 실제 기능이 동작하는지
  확인한다.
- 한 child의 loading/error/retry가 다른 정상 section과 page heading을 숨기지 않는지 검증한다.

- [ ] 2.1 PROD-645와 PROD-648의 최신 통합 surface, 완료 상태와 변경 댓글을 다시 확인하고 current branch의 통합 경계를 정렬한다.
- [ ] 2.2 PROD-645 Account 설정 결과를 `계정 설정` section에 연결하고 Account 범위와 외부 이동 상태를 보존한다.
- [ ] 2.3 PROD-648 Profile 설정 결과를 현재 대상이 명시된 `프로필 설정` section에 연결하고 actor/Profile 데이터 격리를 보존한다.
- [ ] 2.4 두 child의 loading·error·retry와 성공 content가 같은 page에서 독립적으로 동작하는 통합 검증을 추가한다.

## 3. PROD-653 Canonical route와 shell navigation

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/breakpoints.md`
- `docs/design/page-header.md`
- `PROD-653`

**Deliverable**

인증 사용자가 full·compact·mobile Web과 Android·iOS의 승인된 navigation surface에서 canonical `/settings`를
열고 플랫폼별로 heading 하나와 기존 shell layout을 유지한다.

**Guardrails**

- `/settings`는 기존 `(tabs)` 보호 route guard와 universal Expo route tree를 사용한다.
- full sidebar, compact icon rail과 mobile drawer에만 `설정`을 노출하고 bottom tab·right rail에는 중복하지
  않는다.
- mobile Web은 shell이 `설정` header를 소유하고 Native·compact/full Web은 route가 첫 heading을 소유한다.
- route와 통합 가능한 page content가 함께 준비된 slice에서만 navigation을 노출한다.
- Web forward navigation의 document-top 정책과 browser history restoration을 유지한다.

**Verification**

- 보호 route guest redirect, full·compact·drawer href·page-current·drawer close, bottom tab/right rail 중복 부재와
  breakpoint별 heading 소유권을 unit/component test로 검증한다.
- mobile Web forward navigation과 browser back/forward scroll restoration을 실제 browser에서 확인한다.

- [ ] 3.1 `/settings`를 Android·iOS·Web이 공유하는 보호 route로 연결하고 guest·session loading/error guard 동작을 유지한다.
- [ ] 3.2 full sidebar, compact icon rail과 mobile drawer에 `/settings` 진입점·page-current·drawer close를 연결하되 bottom tab과 right rail은 유지한다.
- [ ] 3.3 mobile Web shell header와 Native·compact/full Web route header가 `설정` heading을 정확히 한 번 제공하도록 연결한다.
- [ ] 3.4 route parity, 보호 guard, surface별 navigation·header와 Web forward/history 회귀 테스트를 추가한다.

## 4. PROD-653 페이지 수준 접근성·플랫폼 검증과 완료 증거

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-653`

**Deliverable**

Web·Android·iOS와 keyboard·screen reader·작은 화면에서 `/settings` route, Account/Profile 소유 단위와 현재
대상이 함께 동작한다는 페이지 수준 증거가 남고, 구현과 canonical·Linear·OpenSpec이 일치한다.

**Guardrails**

- Web 정적/Storybook 결과를 Android·iOS runtime 또는 전체 WCAG 2.2 AA 적합성 증거로 일반화하지 않는다.
- PROD-645·PROD-648의 세부 기능 검증을 반복하지 않고 route·navigation·정보 구조 통합만 검증한다.
- PROD-653이 change 정합성 확인과 archive를 소유하되 두 child dependency와 전체 tasks가 완료되기 전에는
  archive하지 않는다.

**Verification**

- Relay compiler, TypeScript, 관련 unit/component test, Storybook test·static build·a11y와 OpenSpec strict
  validation 결과를 기록한다.
- Web keyboard·screen reader·reflow와 Android TalkBack·font scaling·48dp, iOS VoiceOver·font scaling·44pt
  target을 실제 실행한 범위와 미실행 범위로 나눠 기록한다.
- 최신 canonical 문서, PROD-653·PROD-645·PROD-648 본문·관계·계약 변경 댓글과 구현 diff를 archive 전에 다시
  대조한다.

- [ ] 4.1 Relay compiler, TypeScript, 관련 unit/component test와 Storybook test·static build·a11y를 통과시킨다.
- [ ] 4.2 mobile·compact·full Web에서 keyboard, screen reader, zoom·reflow, forward/history와 Account/Profile 통합 흐름을 확인하고 증거를 기록한다.
- [ ] 4.3 Android와 iOS에서 drawer 진입, heading·focus, font scaling, screen reader와 platform touch target을 확인하고 증거를 기록한다.
- [ ] 4.4 최신 canonical·Linear authority와 구현·delta spec 정합성을 다시 확인하고 `openspec validate add-settings-page-shell --strict`를 통과시킨다.
