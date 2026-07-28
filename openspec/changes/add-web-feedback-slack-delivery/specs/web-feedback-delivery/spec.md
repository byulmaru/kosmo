## ADDED Requirements

### Requirement: Authenticated feedback submission contract

**Authority / Provenance:** `memory/frontend-react-native.md`, `PROD-479`, `PROD-487` — The API MUST provide a `submitFeedback` GraphQL mutation to accounts with a valid login session. The mutation MUST NOT require a selected Profile, and Web Relay MUST be able to call it through the same-origin BFF `/graphql` with the existing session-cookie authentication.

#### Scenario: Submit with a valid login session

- **WHEN** 유효한 login session을 가진 Web 사용자가 유효한 feedback input으로 `submitFeedback`을 호출한다
- **THEN** API는 로그인 scope를 통과해 feedback 전달을 시도한다

#### Scenario: Submit without a selected Profile

- **WHEN** 유효한 login session은 있지만 선택 Profile이 없는 사용자가 유효한 feedback input을 제출한다
- **THEN** API는 선택 Profile 부재를 이유로 요청을 거부하지 않는다

#### Scenario: Reject an unauthenticated submission

- **WHEN** 유효한 session이 없는 요청이 `submitFeedback`을 호출한다
- **THEN** API는 기존 GraphQL permission error 계약으로 요청을 거부한다
- **AND** Slack webhook을 호출하지 않는다

### Requirement: Feedback input validation

**Authority / Provenance:** `PROD-479`, `PROD-487` — Feedback input MUST contain one of `POSITIVE`, `NEGATIVE`, `FEATURE_REQUEST`, or `BUG_REPORT` and a body whose trimmed length is 1 through 2,000 characters. `BUG_REPORT` MUST accept an optional Sentry event ID, and a provided event ID MUST be exactly 32 case-insensitive hexadecimal characters. Other feedback kinds MUST NOT contain a Sentry event ID.

#### Scenario: Accept the four feedback kinds

- **WHEN** 로그인한 사용자가 네 허용 종류 중 하나와 길이 범위 안의 본문을 제출한다
- **THEN** API는 종류와 trim된 본문을 유효한 feedback input으로 처리한다

#### Scenario: Reject an empty body

- **WHEN** feedback 본문이 없거나 trim 후 빈 문자열이다
- **THEN** API는 본문 field의 validation error를 반환한다
- **AND** Slack webhook을 호출하지 않는다

#### Scenario: Reject an oversized body

- **WHEN** trim된 feedback 본문이 2,000자를 초과한다
- **THEN** API는 본문 field의 validation error를 반환한다
- **AND** Slack webhook을 호출하지 않는다

#### Scenario: Accept an optional Sentry event ID for a bug

- **WHEN** `BUG_REPORT` input이 32자 hexadecimal Sentry event ID를 포함한다
- **THEN** API는 event ID를 정규화한 lowercase 값으로 feedback payload에 포함한다

#### Scenario: Accept a bug without a Sentry event ID

- **WHEN** `BUG_REPORT` input이 Sentry event ID를 포함하지 않는다
- **THEN** API는 event ID 없이 feedback 전달을 시도한다

#### Scenario: Reject an invalid or inapplicable Sentry event ID

- **WHEN** event ID가 32자 hexadecimal 형식이 아니거나 `BUG_REPORT`가 아닌 종류에 포함된다
- **THEN** API는 event ID field의 validation error를 반환한다
- **AND** Slack webhook을 호출하지 않는다

### Requirement: Server-owned Slack delivery

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST deliver valid feedback with exactly one Slack Incoming Webhook POST to the API runtime's `SLACK_FEEDBACK_WEBHOOK_URL`. The Slack payload MUST contain only the feedback kind, trimmed body, optional Sentry event ID, and current source `Web`; user-controlled values MUST use plain-text blocks that Slack does not interpret as markup or mentions. The server MUST NOT persist the feedback body or event ID in the database.

#### Scenario: Deliver a valid feedback request

- **WHEN** 인증과 input 검증을 통과한 feedback 요청을 Slack이 성공 상태로 응답한다
- **THEN** server는 요청당 Slack POST 한 번을 수행한다
- **AND** mutation은 제출 성공을 반환한다
- **AND** DB에 feedback record를 생성하지 않는다

#### Scenario: Deliver a bug event ID

- **WHEN** 유효한 `BUG_REPORT`가 Sentry event ID를 포함한다
- **THEN** Slack message는 정규화된 event ID를 별도의 plain-text field로 포함한다

#### Scenario: Prevent Slack formatting injection

- **WHEN** feedback 본문에 Slack mention, markdown 또는 URL처럼 해석될 수 있는 문자열이 포함된다
- **THEN** server는 해당 값을 plain-text block content로 전달한다
- **AND** link와 media unfurl을 비활성화한다

#### Scenario: Omit credentials and internal details

- **WHEN** server가 Slack payload를 구성하거나 delivery 실패를 처리한다
- **THEN** webhook URL, session token, cookie, account ID, session ID와 예상하지 못한 오류 세부를 Slack payload, GraphQL response 또는 application log에 포함하지 않는다

#### Scenario: Fail closed when webhook configuration is missing

- **WHEN** `SLACK_FEEDBACK_WEBHOOK_URL`이 없거나 유효한 HTTPS Slack webhook URL이 아니다
- **THEN** mutation은 안전한 delivery unavailable 오류를 반환한다
- **AND** 구성값이나 내부 오류 세부를 응답 또는 log에 노출하지 않는다

### Requirement: Feedback rate and concurrent submission controls

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST limit valid feedback attempts per account to five in each non-persistent fixed ten-minute window, and it MUST NOT start another feedback delivery while the same account already has one in flight. The client MUST disable the submit control while the mutation is in flight. These controls MUST NOT persist feedback content or submission records in the database.

#### Scenario: Allow attempts within the rate window

- **WHEN** account의 현재 10분 window 안 유효한 feedback 시도가 5건 미만이고 진행 중 delivery가 없다
- **THEN** server는 새 feedback delivery 시도를 허용한다

#### Scenario: Reject a sixth attempt

- **WHEN** account가 현재 10분 window 안에서 여섯 번째 유효한 feedback을 제출한다
- **THEN** server는 rate-limited 오류를 반환한다
- **AND** Slack webhook을 호출하지 않는다

#### Scenario: Reject a concurrent account submission

- **WHEN** 같은 account의 Slack delivery가 아직 완료되지 않은 동안 새 유효한 feedback 요청이 도착한다
- **THEN** server는 새 요청을 concurrent-submission 오류로 반환한다
- **AND** 두 번째 Slack webhook POST를 시작하지 않는다

#### Scenario: Block repeated client interaction while submitting

- **WHEN** Web feedback mutation이 진행 중이다
- **THEN** client는 submit control을 disabled와 busy 상태로 노출한다
- **AND** 동일 상호작용으로 추가 mutation을 시작하지 않는다

#### Scenario: Do not persist rate or in-flight state

- **WHEN** server가 account rate window와 진행 중 delivery를 추적한다
- **THEN** 해당 상태는 API process memory에만 유지된다
- **AND** process restart 또는 rollout 이후 이전 rate window를 복원하지 않는다

### Requirement: Explicit retry and delivery outcome

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST NOT retry Slack delivery automatically. It MUST report success only after confirming Slack's successful response, and it MUST treat a timeout, network failure, or non-success response as failure. The client MUST preserve failed input and allow the user to submit it again explicitly. The contract MUST allow a rare duplicate Slack message when an explicit retry follows an ambiguous failure.

#### Scenario: Confirm a successful delivery

- **WHEN** Slack Incoming Webhook이 성공 상태로 응답한다
- **THEN** server는 mutation을 성공으로 완료한다
- **AND** client는 접근 가능한 한국어 성공 상태를 표시하고 제출 field를 초기화한다

#### Scenario: Preserve input after a failed delivery

- **WHEN** Slack request가 timeout, network failure 또는 non-success response로 끝난다
- **THEN** server는 자동으로 다시 POST하지 않고 안전한 delivery failure를 반환한다
- **AND** client는 종류, 본문과 적용 가능한 event ID를 유지한다
- **AND** 사용자는 같은 화면에서 명시적으로 다시 제출할 수 있다

#### Scenario: Handle an ambiguous failure retry

- **WHEN** Slack이 message를 수신했을 수 있지만 server가 성공 응답을 확인하지 못한 요청을 사용자가 명시적으로 재시도한다
- **THEN** server는 새 사용자 제출로 Slack POST 한 번을 수행할 수 있다
- **AND** 이전 message와 중복될 가능성을 허용한다

#### Scenario: Show a safe localized error

- **WHEN** validation 외 feedback delivery가 실패한다
- **THEN** client는 webhook 응답 body나 내부 예외 message 대신 안전한 한국어 오류와 재시도 동작을 표시한다

### Requirement: Web feedback form accessibility and state

**Authority / Provenance:** `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487` — The protected `/menu` Web screen MUST provide the feedback kind, body, optional bug event ID, and submit control using React Native primitives and semantic theme tokens. UI labels, headings, and buttons MUST use `SUIT`, while the long feedback-body input MUST use `Pretendard`. Error, success, disabled, and busy states MUST be exposed to assistive technology without relying on visual presentation alone.

#### Scenario: Render the feedback form on Web

- **WHEN** 로그인한 Web 사용자가 `/menu`를 연다
- **THEN** 시스템은 네 feedback 종류, 본문 input과 submit control을 렌더링한다
- **AND** touch target, label, heading과 상태는 접근 가능한 semantics를 제공한다

#### Scenario: Show the event ID field for a bug

- **WHEN** 사용자가 `BUG_REPORT` 종류를 선택한다
- **THEN** 시스템은 선택적 Sentry event ID input과 32자 hexadecimal 형식 안내를 표시한다

#### Scenario: Hide and clear the event ID for a non-bug

- **WHEN** 사용자가 `BUG_REPORT`에서 다른 종류로 변경한다
- **THEN** 시스템은 Sentry event ID input을 숨기고 기존 event ID 값을 제거한다

#### Scenario: Announce feedback status

- **WHEN** 제출이 진행 중이거나 성공 또는 실패로 완료된다
- **THEN** 시스템은 현재 상태를 접근 가능한 한국어 status로 알린다

#### Scenario: Keep native UI out of the Web slice

- **WHEN** Android 또는 iOS 앱이 이번 변경의 `/menu` 화면을 렌더링한다
- **THEN** 시스템은 `PROD-488` 전까지 feedback form과 feedback navigation entry를 native에 새로 노출하지 않는다

### Requirement: Feedback secret injection and production smoke

**Authority / Provenance:** `PROD-479`, `PROD-487` — The deployment environment MUST inject `SLACK_FEEDBACK_WEBHOOK_URL` as a secret only into the API runtime and MUST NOT include it in the client bundle or Relay payload. The 2026-07-29 production verification MUST submit real Web feedback with an authenticated smoke account and confirm one successful Slack message, a safe payload, and the UI success state.

#### Scenario: Inject the webhook secret into the API

- **WHEN** API가 Vault-managed 배포 환경에서 시작한다
- **THEN** `SLACK_FEEDBACK_WEBHOOK_URL`은 API process environment에서만 사용할 수 있다
- **AND** Expo public environment, generated GraphQL schema와 Web asset에 secret 값이 포함되지 않는다

#### Scenario: Run the production delivery smoke

- **WHEN** 운영자가 production Web에서 인증된 smoke account로 식별 가능한 비민감 test feedback을 제출한다
- **THEN** Web UI는 성공 상태를 표시한다
- **AND** 지정 Slack channel에는 해당 요청의 message 한 건이 나타난다
- **AND** message와 관찰 가능한 log에 webhook URL, token, cookie, account ID와 예상하지 못한 오류 세부가 없다
