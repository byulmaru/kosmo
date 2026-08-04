## 1. PROD-643 Profile별 Unread 상태와 비차단 조회

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/domain/objects/notification.md`
- `PROD-643`

**Deliverable**

Profile picker를 열면 현재 Account가 접근할 수 있는 각 Profile의 서버 제공 Unread 존재 여부가 picker와 Profile
선택을 막지 않고 갱신된다. 최초 성공 전에는 숨기고, refresh 실패에는 같은 Profile의 마지막 성공 상태만
유지하며, 다음 성공 응답과 Account·actor generation에 안전하게 수렴한다.

**Guardrails**

- 기존 suspending shell·ProfileSwitcher fragment에 count 조회를 결합하지 않는다.
- 성공 응답은 Profile ID별 boolean snapshot을 원자 교체하고 응답에서 사라진 Profile의 이전 값을 제거한다.
- close/reopen, Account 변경과 actor environment 교체 뒤 늦은 완료는 적용하지 않는다.
- GraphQL schema·resolver, DB·migration와 package dependency를 변경하지 않는다.

**Verification**

- 테스트 코드 범위: Profile별 boolean 변환, 최초 상태, refresh failure, 성공 누락, Account/Profile 격리와 stale
  request guard를 검증하는 가장 가까운 unit test를 추가한다.
- Storybook Relay operation 응답으로 최초 loading/error와 성공·refresh failure 순서를 검증한다.
- 새 API 동작이 없으므로 API 구현·schema test는 추가하지 않고, 기존 다중 Profile notification count integration
  test를 회귀 검증으로 실행한다.

- [ ] 1.1 Profile별 count 응답을 격리된 boolean 성공 상태로 변환하는 동작을 unit test로 먼저 고정한다.
- [ ] 1.2 picker open에서 현재 Account의 Profile별 Unread를 별도 non-suspending network operation으로
      갱신하고, 최초 loading/error가 picker와 Profile 선택을 막지 않게 한다.
- [ ] 1.3 refresh failure·성공 응답 누락·Account 변경에 대한 last-success 교체 동작을 구현하고 unit test를
      통과시킨다.
- [ ] 1.4 close/reopen과 actor environment 교체 뒤 늦은 완료를 취소·무시하는 동작을 구현하고 순서 제어 test를
      통과시킨다.
- [ ] 1.5 별도 Profile별 Unread query의 Relay generated artifact를 갱신하고 app type check를 통과시킨다.

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

- 테스트 코드 범위: `apps/app/src/stories/Shell.stories.tsx`의 가장 가까운 ProfileSwitcher interaction에
  selected/non-selected, 0/양수/큰 count, 접근성 이름, dot 숨김과 layout 불변을 추가한다.
- Web visual/interaction 자동 검증에 더해 Web·Android·iOS 수동 시각 QA에서 12-unit dot의 우상단 위치·크기,
  avatar clipping과 행 geometry 불변을 확인하고, Android TalkBack과 iOS VoiceOver에서 접근성 이름, selected
  state와 touch target을 확인한다. 실행하지 못한 platform QA는 자동화 통과와 구분해 보고한다.
- exact count 표시, 새 알림 content UI, push·realtime·OS badge 검증은 승인 범위 밖이므로 추가하지 않는다.

- [ ] 2.1 Profile option avatar의 12 logical unit `accent` dot을 selected/non-selected와 모든 surface에서 행
      geometry를 바꾸지 않게 표시한다.
- [ ] 2.2 dot을 모든 platform의 접근성 트리에서 숨기고 option의 기존 이름·handle에 boolean
      `읽지 않은 알림 있음`만 조건부로 추가한다.
- [ ] 2.3 0·양수·큰 count, selected/non-selected, 기존 check·hit target과 접근성 상태를 Storybook
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

- picker의 boolean 상태를 셸 badge의 exact count나 알림 목록 데이터로 재사용하지 않는다.
- 기존 Profile 선택 mutation, navigation guard, actor reset과 selected Profile 알림 격리 계약을 보존한다.
- passing automation과 실행하지 못한 Web·Android·iOS runtime QA를 별도 근거로 보고한다.
- 이 change는 PROD-643의 전체 선언 범위와 검증이 끝난 뒤에만 archive한다.

**Verification**

- 테스트 코드 범위: `apps/web/e2e/profile-switcher.e2e.ts`에 다른 Profile의 dot 확인 → Profile 선택 → 새 actor
  query와 selected Profile 셸 badge·알림 목록 수렴을 검증하는 최소 경로를 추가한다.
- `@kosmo/app` unit·type/Relay·Storybook tests/build, targeted Web profile-switcher E2E와 기존 API notification
  integration test를 실행한다.
- 전체 OpenSpec strict validation, formatting/diff check와 독립 누락 검토를 통과한다.
- 새 API/DB/dependency 동작이 없으므로 별도 API 구현 test, migration test와 dependency audit 확장은 제외한다.

- [ ] 3.1 다른 Profile의 picker dot 확인부터 선택, 새 actor의 기존 셸 badge·알림 목록 수렴까지 Web E2E로
      검증한다.
- [ ] 3.2 기존 selected Profile badge와 notification integration 회귀 test를 실행해 Profile 격리가 유지됨을
      확인한다.
- [ ] 3.3 app unit·Relay/type check·Storybook test/build와 targeted Web E2E를 실행하고 실패를 해소한다.
- [ ] 3.4 canonical 문서, Linear `PROD-643`, delta spec, decisions와 구현을 교차 확인하고 OpenSpec strict
      validation·formatting/diff check를 통과시킨다.
- [ ] 3.5 독립 구현 리뷰에서 scope·race·접근성·검증 누락이 없는지 확인하고 actionable finding을 반영한다.
- [ ] 3.6 전체 task와 필요한 runtime QA 근거가 완료된 뒤 change를 main spec과 동기화하고 archive한다.
