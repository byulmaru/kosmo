## 1. PROD-487 Authenticated feedback API contract

**Authority / Provenance**

- `memory/frontend-react-native.md`
- `PROD-479`
- `PROD-487`

**Deliverable**

유효한 login session을 가진 account가 선택 Profile 유무와 관계없이 네 종류의 제한된 feedback input을 GraphQL로 제출할 수 있고, 비인증·잘못된 input은 Slack 호출 전에 거부된다.

**Guardrails**

- `submitFeedback`은 기존 GraphQL `login` scope와 Web cookie-to-Bearer bridge를 사용한다.
- Category와 1~2,000자 body 계약을 유지하고 Sentry event ID를 공개 input에 포함하지 않는다.
- Feedback 제출은 persisted domain object를 생성하거나 반환하지 않는다.

**Verification**

- Valid session, selected Profile 없음, anonymous와 category/body boundary를 API test로 검증한다.
- Generated GraphQL schema가 enum, input, payload와 mutation contract를 정확히 포함하는지 확인한다.

- [x] 1.1 Login-scoped feedback GraphQL public contract와 성공 payload를 구현한다.
- [x] 1.2 Feedback input validation과 선택 Profile이 없는 session의 제출 동작을 구현한다.
- [x] 1.3 인증·input boundary test를 추가하고 GraphQL schema를 현재 contract에 맞게 생성한다.

## 2. PROD-487 Safe Slack delivery and abuse controls

**Authority / Provenance**

- `PROD-479`
- `PROD-487`

**Deliverable**

유효한 feedback 요청은 secret과 사용자 정보를 노출하지 않는 plain-text Slack message로 요청당 한 번 전송되고, 같은 계정의 동시 전송 차단과 명시적 retry 계약을 지킨다.

**Guardrails**

- API runtime만 `SLACK_FEEDBACK_WEBHOOK_URL`을 소유하며 user body와 delivery metadata를 DB에 영속화하지 않는다.
- Slack 성공 응답을 확인한 요청만 성공 처리하고 server는 자동 retry하지 않는다.
- 같은 account의 concurrent delivery를 시작하지 않고, 완료 시 process-local in-flight 상태를 즉시 제거한다.
- Account별 요청 횟수 제한과 rate history는 이번 범위에서 구현하거나 영속화하지 않는다.
- Slack payload는 제출 Account 내부 ID와 선택 Profile의 내부 ID·`displayName` 닉네임·`relativeHandle`만 identity allowlist로 포함하고 source field를 포함하지 않는다.
- 오류 처리와 payload에서 credential, Account `displayName`, 이메일, OIDC subject, session identity, 선택되지 않은 다른 Profile 정보, upstream response body와 예상하지 못한 오류 세부를 노출하지 않는다.

**Verification**

- Stubbed network로 success, invalid config, timeout, network failure, non-success와 single-POST 동작을 검증한다.
- Plain-text payload, unfurl 비활성화, secret/redaction과 DB 미사용을 검증한다.
- Same-account concurrent rejection과 완료 뒤 다음 요청 허용을 concurrency test로 검증한다.

- [x] 2.1 API-owned Incoming Webhook configuration, safe payload와 single-attempt delivery 동작을 구현한다.
- [x] 2.2 Account별 process-local in-flight guard와 종료 시 상태 해제를 구현한다.
- [x] 2.3 Delivery outcome, no-auto-retry, payload/redaction와 concurrent behavior test를 추가한다.
- [x] 2.4 Slack payload의 Account ID와 선택 Profile 닉네임·ID·relative handle을 구현하고 source 제거·Profile 부재·identity allowlist를 검증한다.

## 3. PROD-487 Web feedback experience

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- `memory/frontend-react-native.md`
- `PROD-479`
- `PROD-487`

**Deliverable**

로그인한 Web 사용자가 full/compact sidebar와 mobile drawer에서 `/menu` feedback 화면으로 이동해 접근 가능한 form을 제출하고 성공·실패·명시적 retry 상태를 이해할 수 있다.

**Guardrails**

- Web shell의 기존 설정·지원 위치를 "피드백 보내기" link로 사용하고 `/menu` active semantics와 drawer close를 유지한다.
- Android/iOS feedback entry와 form은 `PROD-488` 전까지 새로 노출하지 않는다.
- React Native primitive, semantic theme token, SUIT UI text와 Pretendard long-body input을 사용한다.
- Pending 동안 반복 제출을 막고, 실패 시 input을 유지하며 성공이 확인된 뒤에만 field를 초기화한다.
- Backend/upstream error message를 그대로 표시하지 않고 접근 가능한 안전한 한국어 상태를 사용한다.

**Verification**

- Full/compact/drawer navigation, active semantics, drawer close와 native unchanged behavior를 component 또는 Storybook test로 검증한다.
- Idle, validation, BUG_REPORT 선택, pending, success, failure와 retry state를 Storybook interaction과 unit test로 검증한다.
- Web E2E에서 인증 사용자 menu 진입과 Relay success/failure 흐름을 검증한다.

- [x] 3.1 Web shell의 feedback navigation과 `/menu` current-state behavior를 구현하고 native surface를 유지한다.
- [x] 3.2 Web feedback form, colocated Relay mutation과 validation·pending·success·failure·retry state를 구현한다.
- [x] 3.3 Feedback form과 shell surface의 Storybook 상태·접근성·interaction test를 추가한다.
- [x] 3.4 인증된 Web menu navigation과 제출 성공·실패 흐름의 E2E 증거를 추가한다.

## 4. PROD-487 Integrated verification and production delivery

**Authority / Provenance**

- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- `memory/frontend-react-native.md`
- `PROD-479`
- `PROD-487`

**Deliverable**

API·Web contract와 secret 경계가 repository checks를 통과하고, production Vault 설정과 인증 smoke로 실제 Slack 한 건 전달을 확인할 수 있다.

**Guardrails**

- `SLACK_FEEDBACK_WEBHOOK_URL` 실제 값은 repository, client bundle, Relay payload와 test fixture에 기록하지 않는다.
- `api-env` Secret 참조는 optional이며, 누락 시 API Pod 기동을 유지하고 feedback mutation만 fail closed로 실패한다.
- Production smoke는 비민감하고 식별 가능한 test feedback을 사용하며 Web UI 성공과 Slack message 한 건을 함께 확인한다.
- Android/iOS 통합 검증, 부모 `PROD-479`의 final archive와 cross-platform completion은 이번 task group에서 수행하지 않는다.

**Verification**

- `pnpm --filter @kosmo/api test`, `pnpm --filter @kosmo/app test`, 관련 API integration test와 `pnpm test:e2e`를 통과시킨다.
- `pnpm lint:eslint`, `pnpm lint:prettier`와 `openspec validate add-web-feedback-slack-delivery --strict`를 통과시킨다.
- Helm render에서 API `api-env` 참조가 optional인지 확인한다.
- Web export와 repository search로 client artifact에 webhook secret 또는 hard-coded Slack URL이 없음을 확인한다.
- Production smoke의 시간, environment, UI result와 Slack single-message/redaction result를 민감값 없이 기록한다.

- [x] 4.1 Relay/schema generation, API·app·Web E2E와 workspace lint/format 검증을 실행하고 실패를 수정한다.
- [x] 4.2 API-only Vault secret을 optional runtime 설정으로 주입하고 production smoke 절차를 민감값 없이 문서화하며 client export의 secret 비노출을 검증한다.
- [ ] 4.3 Production Web에서 인증 smoke를 실행해 Slack message 한 건, safe payload와 UI 성공 상태를 확인한다.
- [x] 4.4 `PROD-487` 검증 증거를 정리하고 `PROD-488` unblock 및 부모 `PROD-479`의 후속 integration/archive 책임을 handoff한다.
- [ ] 4.5 로컬 API 개발 process가 optional API 전용 Vault path를 병합하고 Web·Expo process에는 feedback secret을 주입하지 않도록 실행 경계를 연결한다. (코드 연결 완료, Vault key를 공용 local path에서 API 전용 path로 이동하는 운영 작업 대기)
