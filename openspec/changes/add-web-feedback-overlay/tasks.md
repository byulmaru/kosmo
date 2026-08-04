## 1. PROD-594 Form 상태 경계

**Authority / Provenance**

- `docs/design/feedback.md`
- `PROD-594`

**Deliverable**

기존 page와 overlay가 같은 `FeedbackForm` 제출 흐름을 사용하고 overlay는 draft 변경과 제출 진행 여부만 관찰할 수 있다.

**Guardrails**

- Form은 query, overlay, confirmation, close source와 browser history를 소유하지 않는다.
- 기존 종류·본문 state, validation, Relay mutation, 성공 초기화, 실패 draft·retry를 복제하거나 변경하지 않는다.

**Verification**

- 기존 Feedback Storybook 상태에서 초기 `dirty=false`, 종류·본문 변경 후 `dirty=true`, mutation pending 동안 `submitting=true`, 성공 초기화 후 `dirty=false`를 관찰한다.
- `/feedback` page의 idle, validation, pending, success와 failure retry가 바뀌지 않았음을 확인한다.

- [x] 1.1 기존 Feedback Storybook test surface에 `{ dirty, submitting }` 상태 전이를 직접 증명하는 최소 실패 assertion을 추가한다.
- [x] 1.2 `FeedbackForm`이 presentation-neutral 상태 signal을 보고하도록 구현하고 page consumer의 기존 동작을 유지한다.
- [x] 1.3 Feedback Storybook의 idle·validation·pending·success·failure와 실패 후 입력 유지 검증을 통과시킨다.

## 2. PROD-594 Responsive Web overlay

**Authority / Provenance**

- `docs/design/feedback.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-594`

**Deliverable**

Web 사용자가 현재 shell 전체 위에서 accessible feedback bottom sheet 또는 dialog를 열고 기존 form으로 제출할 수 있다.

**Guardrails**

- `<768px`는 bottom sheet, `>=768px`는 최대 약 `600px` 너비와 `85dvh` 높이의 중앙 dialog다.
- 배경 shell은 pointer, keyboard와 accessibility tree 상호작용에서 차단되고 focus는 overlay 안에 머문다.
- 성공 후 overlay를 유지하고 실패 후 draft와 retry를 유지한다.
- 기존 범용 `ModalSheet` 소비자의 geometry와 behavior는 변경하지 않는다.

**Verification**

- Feedback Storybook에서 390px sheet, 900px·1400px dialog와 가용 높이 body scroll을 확인한다.
- close button name, dialog title, initial focus, Tab 순환, `Escape`, backdrop와 background 차단을 검사한다.

- [x] 2.1 Feedback Storybook에 mobile sheet와 desktop dialog의 observable geometry·semantics를 증명하는 최소 overlay stories/assertion을 추가한다.
- [x] 2.2 기존 breakpoint token을 사용해 Web 전용 sheet/dialog surface와 내부 form body scroll을 구현한다.
- [x] 2.3 overlay 제목·닫기 control, focus 진입·trap·restore, background inert/aria-hidden과 document scroll lock을 구현한다.
- [x] 2.4 clean·dirty·submitting close 정책과 success 유지·failure retry 흐름을 하나의 `requestClose` 경계에 연결한다.

## 3. PROD-594 Shell query와 history lifecycle

**Authority / Provenance**

- `docs/design/feedback.md`
- `docs/design/breakpoints.md`
- `PROD-594`

**Deliverable**

모든 Web shell 피드백 진입점이 현재 route 위 단일 overlay를 열고 browser history, direct `/feedback`, route·scroll·focus 맥락을 보존한다.

**Guardrails**

- overlay는 `UniversalShellContent`의 shell root와 나란한 단일 Web 인스턴스다.
- 현재 pathname과 feedback 이외 query를 보존하고 query-only open/close를 primary route scroll reset으로 기록하지 않는다.
- Android/iOS 진입과 `/feedback` direct page, PROD-591 mobile header ownership은 변경하지 않는다.

**Verification**

- full sidebar, compact rail, mobile drawer가 동일한 overlay를 열고 mobile drawer가 먼저 닫히는지 확인한다.
- internal push/back/forward, fresh-load query replace close, 기존 query 보존과 `/feedback` 중복 overlay 방지를 확인한다.

- [x] 3.1 기존 Storybook Expo Router mock이 query push·replace·back/forward 결과를 표현하도록 최소 범위로 확장하고 shell history assertion을 먼저 추가한다.
- [x] 3.2 Web shell 진입은 `feedback=open`을 사용하고 Android/iOS는 `/feedback` route를 유지하도록 responsive navigation을 연결한다.
- [x] 3.3 `UniversalShellContent`의 shell root 다음에 단일 Web feedback overlay를 조립하고 `/feedback` direct route에서는 중복 렌더링하지 않는다.
- [x] 3.4 internal open, fresh-load restore, clean/dirty/submitting browser traversal과 close 후 route·scroll·focus 복원을 구현한다.

## 4. PROD-594 직접 동작 검증

**Authority / Provenance**

- `docs/design/feedback.md`
- `docs/design/accessibility.md`
- `PROD-594`

**Deliverable**

승인된 overlay navigation, 상태 보존과 접근성 lifecycle을 자동화와 실제 Web 관찰로 구분해 입증한다.

**Guardrails**

- 테스트 코드 범위: 기존 `Feedback.stories.tsx`, `Shell.stories.tsx`, Storybook Expo Router mock과 전용 `apps/web/e2e/feedback-overlay.e2e.ts`의 직접 시나리오만 포함한다.
- 테스트 필요성: query open/close·direct fallback·dirty/submitting guard·success 유지·history·focus/scroll 복원은 기존 page stories와 header E2E가 증명하지 못하는 신규 사용자 동작이다.
- 테스트 제외 범위: Native/API/Slack 테스트, 관련 없는 Storybook 조합·snapshot·fixture, 범용 helper·새 test infrastructure, 기존 shell header E2E 확대와 저장소 전체 coverage 확장은 포함하지 않는다.

**Verification**

- 전용 Web E2E에서 인증된 open, direct `/feedback`, fresh query, back/forward, dirty 취소·확인, submitting 차단과 success 연속 제출을 검증한다.
- 실제 browser에서 390px·900px·1400px, keyboard, focus indicator, document scroll과 background pointer 차단을 관찰한다.

- [x] 4.1 전용 Web E2E에 query open·clean close/back/forward·fresh-load close와 direct `/feedback` fallback 시나리오를 추가하고 통과시킨다.
- [x] 4.2 전용 Web E2E에 dirty 취소·폐기, submitting close 차단, success 후 overlay 유지·연속 제출과 focus/scroll 복원 시나리오를 추가하고 통과시킨다.
- [x] 4.3 390px·900px·1400px 실제 Web runtime에서 responsive geometry, keyboard focus trap/restore, `Escape`, backdrop, background 차단과 document scroll을 수동 확인한다.

## 5. PROD-594 통합과 전달

**Authority / Provenance**

- `docs/design/feedback.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-594`

**Deliverable**

PROD-594의 구현·문서·검증 결과가 하나의 리뷰 가능한 Web-only 변경으로 정리된다.

**Guardrails**

- `add-web-feedback-slack-delivery`의 production smoke와 archive를 이번 구현 완료 증거로 대신하거나 이 change보다 뒤에 archive하지 않는다.
- 자동화 통과를 실제 Web reflow·focus·scroll 관찰 완료로 표현하지 않는다.
- Android/iOS, GraphQL/API, Slack payload와 새 dependency는 변경하지 않는다.

**Verification**

- OpenSpec strict validation, 관련 Storybook tests, Web E2E, app typecheck/lint와 `git diff --check`를 실행한다.
- 독립 구현 리뷰에서 승인 범위, 회귀 위험과 검증 공백을 확인한다.

- [x] 5.1 OpenSpec strict validation과 관련 자동화·정적 검사를 통과시키고 실행하지 못한 runtime/platform 검증을 분리해 기록한다.
- [x] 5.2 독립 구현 리뷰 findings를 해결한 뒤 task·Draft PR 본문과 최종 검증 증거를 동기화한다.
- [x] 5.3 후속 독립 리뷰에서 확인된 동적 route query, history fallback과 폐기 직후 재개방 회귀를 해결하고 검증 증거를 다시 동기화한다.
- [x] 5.4 reload 후 history index와 origin ID가 모두 없는 다단계 browser back 회귀를 해결하고 전용 Web E2E로 검증한다.
