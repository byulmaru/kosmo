## 1. PROD-643 기존 Profile 데이터 소유권 재사용

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/domain/objects/notification.md`
- `PROD-643`

**Deliverable**

Profile picker는 기존 `ProfileSwitcher_query`가 소유한 각 Profile의 서버 제공
`unreadNotificationCount`에서 Unread 존재 여부를 직접 파생한다. picker open 전용 query·Store·request
lifecycle을 추가하지 않는다.

**Guardrails**

- 기존 `me.profiles` fragment selection에 count를 선언하고 `> 0` boolean만 표시한다.
- exact count를 UI 상태나 accessible name으로 노출하지 않는다.
- GraphQL schema·resolver, DB·migration와 package dependency를 변경하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/stories/patterns/Shell.stories.tsx`의 가장 가까운 ProfileSwitcher interaction에서
  기존 shell fragment fixture의 0·양수·큰 count가 올바른 boolean 표시로 이어지는지 검증한다.
- Relay artifact와 app type check에서 기존 fragment consumer가 count를 제공하는지 확인한다.
- 별도 request lifecycle unit test, fixture, helper와 retry/error 조합은 제외한다.

- [x] 1.1 `ProfileSwitcher_query`의 `me.profiles`에 `unreadNotificationCount`를 선언하고 option에서
      `> 0`으로 직접 파생한다.
- [x] 1.2 별도 Unread query, 임시 Relay Environment/Store, last-success snapshot, request identity helper와
      전용 unit/interaction test를 제거한다.
- [x] 1.3 Relay artifact를 갱신하고 app type check를 통과시킨다.

## 2. PROD-643 12-unit avatar dot과 접근성

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `PROD-643`

**Deliverable**

Web·Android·iOS의 selected/non-selected Profile option은 Unread가 있을 때 avatar 우상단에 숫자 없는 12 logical
unit `accent` dot을 표시하며, screen reader는 기존 Profile 이름·handle과 boolean Unread 상태를 하나의 option으로
읽는다.

**Guardrails**

- dot은 option의 행 폭, label, pointer·touch target과 selected check를 밀지 않는다.
- dot은 접근성 트리와 focus 순서에서 숨기고 별도 control로 만들지 않는다.
- exact count는 시각적 UI와 accessible name에 노출하지 않는다.
- 기존 selected state, role, disabled state, 선택 mutation·actor reset과 8px 셸 badge 구현을 변경하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/stories/patterns/Shell.stories.tsx`의 가장 가까운 ProfileSwitcher interaction에
  selected/non-selected, 0/양수/큰 count, 접근성 이름, dot 숨김과 layout 불변을 유지한다.
- Web visual/interaction 자동 검증에 더해 Web·Android·iOS 수동 시각 QA에서 12-unit dot의 우상단 위치·크기,
  avatar clipping과 행 geometry 불변을 확인하고, Android TalkBack과 iOS VoiceOver에서 접근성 이름, selected
  state와 touch target을 확인한다.
- exact count 표시, 새 알림 content UI, push·realtime·OS badge 검증은 승인 범위 밖이므로 추가하지 않는다.

- [x] 2.1 Profile option avatar의 12 logical unit `accent` dot을 selected/non-selected와 모든 surface에서 행
      geometry를 바꾸지 않게 표시한다.
- [x] 2.2 dot을 모든 platform의 접근성 트리에서 숨기고 option의 기존 이름·handle에 boolean
      `읽지 않은 알림 있음`만 조건부로 추가한다.
- [x] 2.3 0·양수·큰 count, selected/non-selected, 기존 check·hit target과 접근성 상태를 Storybook
      interaction/visual fixture로 검증한다.
- [ ] 2.4 Web·Android·iOS 적용 surface에서 12-unit dot의 위치·크기, avatar clipping과 행 geometry를 수동
      시각 확인하고, Web keyboard/screen reader, Android TalkBack과 iOS VoiceOver QA를 실행하며 확인하지 못한
      platform 항목을 명시한다.

## 3. PROD-643 Profile 전환 수렴과 완료 검증

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `docs/domain/objects/notification.md`
- `PROD-643`

**Deliverable**

다른 Profile의 picker Unread dot에서 Profile을 선택한 뒤 기존 actor 전환, selected Profile 8px 셸 badge와 알림
목록이 새 Profile의 서버 상태로 수렴하며, PROD-643 범위의 자동·수동 검증과 OpenSpec 정합성 근거가 완료된다.

**Guardrails**

- picker 존재 표시를 셸 badge의 exact count나 알림 목록 데이터로 재사용하지 않는다.
- 기존 Profile 선택 mutation, navigation guard, actor reset과 selected Profile 알림 격리 계약을 보존한다.
- passing automation과 실행하지 못한 Web·Android·iOS runtime QA를 별도 근거로 보고한다.
- 이 change는 PROD-643의 전체 선언 범위와 검증이 끝난 뒤에만 archive한다.

**Verification**

- 테스트 코드 범위: `apps/web/e2e/profile-switcher.e2e.ts`에 최신 shell query 이후 다른 Profile의 dot 확인 →
  Profile 선택 → 새 actor query와 selected Profile 셸 badge·알림 목록 수렴을 검증하는 최소 경로를 유지한다.
- `@kosmo/app` unit·type/Relay·Storybook tests/build, targeted Web profile-switcher E2E와 기존 API notification
  integration test를 실행한다.
- 전체 OpenSpec strict validation, formatting/diff check와 독립 누락 검토를 통과한다.
- 새 API/DB/dependency 동작이 없으므로 별도 API·DB 구현 test와 dependency audit 확장은 제외한다.

- [ ] 3.1 최신 shell query 이후 다른 Profile의 picker dot 확인부터 선택, 새 actor의 기존 셸 badge·알림 목록
      수렴까지 Web E2E로 검증한다.
- [x] 3.2 기존 selected Profile badge와 notification integration 회귀 test를 실행해 Profile 격리가 유지됨을
      확인한다.
- [ ] 3.3 app unit·Relay/type check·Storybook test/build와 targeted Web E2E를 실행하고 실패를 해소한다.
- [x] 3.4 canonical 문서, Linear `PROD-643`, delta spec, decisions와 구현을 교차 확인하고 OpenSpec strict
      validation·formatting/diff check를 통과시킨다.
- [x] 3.5 독립 구현 리뷰에서 scope·Relay data ownership·접근성·검증 누락이 없는지 확인하고 actionable
      finding을 반영한다.
- [ ] 3.6 전체 task와 필요한 runtime QA 근거가 완료된 뒤 change를 main spec과 동기화하고 archive한다.
