## ADDED Requirements

### Requirement: Authenticated feedback submission contract

**Authority / Provenance:** `memory/frontend-react-native.md`, `PROD-479`, `PROD-487` — The API MUST provide a `submitFeedback` GraphQL mutation to accounts with a valid login session. The mutation MUST NOT require a selected Profile, and Android/iOS clients plus Web Relay MUST be able to call the same GraphQL contract through their existing authenticated transport.

#### Scenario: Submit with a valid login session

- **WHEN** 유효한 login session을 가진 Android/iOS/Web 사용자가 유효한 feedback input으로 `submitFeedback`을 호출한다
- **THEN** API는 로그인 scope를 통과해 feedback 전달을 시도한다

#### Scenario: Submit without a selected Profile

- **WHEN** 유효한 login session은 있지만 선택 Profile이 없는 사용자가 유효한 feedback input을 제출한다
- **THEN** API는 선택 Profile 부재를 이유로 요청을 거부하지 않는다

#### Scenario: Reject an unauthenticated submission

- **WHEN** 유효한 session이 없는 요청이 `submitFeedback`을 호출한다
- **THEN** API는 기존 GraphQL permission error 계약으로 요청을 거부한다
- **AND** Slack webhook을 호출하지 않는다

### Requirement: Feedback input validation

**Authority / Provenance:** `PROD-479`, `PROD-487` — Feedback input MUST contain one of `POSITIVE`, `NEGATIVE`, `FEATURE_REQUEST`, or `BUG_REPORT` and a body whose trimmed length is 1 through 2,000 characters. Feedback input MUST NOT expose or forward a Sentry event ID.

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

### Requirement: Server-owned Slack delivery

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST deliver valid feedback with exactly one Slack Incoming Webhook POST to the API runtime's `SLACK_FEEDBACK_WEBHOOK_URL`. The Slack payload MUST contain only the feedback kind, trimmed body, submitting Account internal ID, and the selected Profile's internal ID, `displayName` nickname, and `relativeHandle`. It MUST omit a source field and represent the absence of a selected Profile without rejecting the submission. User-controlled values MUST use plain-text blocks that Slack does not interpret as markup or mentions. The server MUST NOT persist the feedback body in the database.

#### Scenario: Deliver a valid feedback request

- **WHEN** 인증과 input 검증을 통과한 feedback 요청을 Slack이 성공 상태로 응답한다
- **THEN** server는 요청당 Slack POST 한 번을 수행한다
- **AND** mutation은 제출 성공을 반환한다
- **AND** DB에 feedback record를 생성하지 않는다

#### Scenario: Identify the submitting Account and selected Profile

- **WHEN** 선택 Profile이 있는 로그인 사용자의 유효한 feedback을 Slack payload로 구성한다
- **THEN** payload는 제출 Account 내부 ID를 포함한다
- **AND** 선택 Profile의 내부 ID, `displayName`을 사용한 닉네임과 `relativeHandle`을 포함한다
- **AND** `출처: Web` 같은 source field를 포함하지 않는다

#### Scenario: Submit without Profile identity

- **WHEN** 선택 Profile이 없는 로그인 사용자의 유효한 feedback을 Slack payload로 구성한다
- **THEN** payload는 제출 Account 내부 ID를 포함한다
- **AND** Profile 정보가 없음을 표시한다
- **AND** 선택 Profile 부재를 이유로 제출을 거부하지 않는다

#### Scenario: Prevent Slack formatting injection

- **WHEN** feedback 본문에 Slack mention, markdown 또는 URL처럼 해석될 수 있는 문자열이 포함된다
- **THEN** server는 해당 값을 plain-text block content로 전달한다
- **AND** link와 media unfurl을 비활성화한다

#### Scenario: Omit credentials and non-allowlisted identity details

- **WHEN** server가 Slack payload를 구성하거나 delivery 실패를 처리한다
- **THEN** webhook URL, session token, cookie, OIDC subject, session ID와 예상하지 못한 오류 세부를 Slack payload, GraphQL response 또는 application log에 포함하지 않는다
- **AND** Account `displayName`, 이메일과 선택되지 않은 다른 Profile 정보는 Slack payload에 포함하지 않는다

#### Scenario: Fail closed when webhook configuration is missing

- **WHEN** `SLACK_FEEDBACK_WEBHOOK_URL`이 없거나 유효한 HTTPS Slack webhook URL이 아니다
- **THEN** mutation은 안전한 delivery unavailable 오류를 반환한다
- **AND** 구성값이나 내부 오류 세부를 응답 또는 log에 노출하지 않는다

### Requirement: Feedback concurrent submission controls

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST NOT start another feedback delivery while the same account already has one in flight. The client MUST disable the submit control while the mutation is in flight. These controls MUST NOT persist feedback content or submission records in the database. Per-account request-count rate limiting is outside the current scope.

#### Scenario: Reject a concurrent account submission

- **WHEN** 같은 account의 Slack delivery가 아직 완료되지 않은 동안 새 유효한 feedback 요청이 도착한다
- **THEN** server는 새 요청을 concurrent-submission 오류로 반환한다
- **AND** 두 번째 Slack webhook POST를 시작하지 않는다

#### Scenario: Block repeated client interaction while submitting

- **WHEN** feedback mutation이 진행 중이다
- **THEN** client는 submit control을 disabled와 busy 상태로 노출한다
- **AND** 동일 상호작용으로 추가 mutation을 시작하지 않는다

#### Scenario: Release non-persistent in-flight state

- **WHEN** 같은 account의 Slack delivery가 성공 또는 실패로 완료된다
- **THEN** server는 해당 account의 in-flight 상태를 즉시 해제한다
- **AND** 해당 상태를 DB에 영속화하지 않는다

### Requirement: Explicit retry and delivery outcome

**Authority / Provenance:** `PROD-479`, `PROD-487` — The server MUST NOT retry Slack delivery automatically. It MUST report success only after confirming Slack's successful response, and it MUST treat a timeout, network failure, or non-success response as failure. The client MUST preserve failed input and allow the user to submit it again explicitly. The contract MUST allow a rare duplicate Slack message when an explicit retry follows an ambiguous failure.

#### Scenario: Confirm a successful delivery

- **WHEN** Slack Incoming Webhook이 성공 상태로 응답한다
- **THEN** server는 mutation을 성공으로 완료한다
- **AND** client는 접근 가능한 한국어 성공 상태를 표시하고 제출 field를 초기화한다

#### Scenario: Preserve input after a failed delivery

- **WHEN** Slack request가 timeout, network failure 또는 non-success response로 끝난다
- **THEN** server는 자동으로 다시 POST하지 않고 안전한 delivery failure를 반환한다
- **AND** client는 종류와 본문을 유지한다
- **AND** 사용자는 같은 화면에서 명시적으로 다시 제출할 수 있다

#### Scenario: Handle an ambiguous failure retry

- **WHEN** Slack이 message를 수신했을 수 있지만 server가 성공 응답을 확인하지 못한 요청을 사용자가 명시적으로 재시도한다
- **THEN** server는 새 사용자 제출로 Slack POST 한 번을 수행할 수 있다
- **AND** 이전 message와 중복될 가능성을 허용한다

#### Scenario: Show a safe localized error

- **WHEN** validation 외 feedback delivery가 실패한다
- **THEN** client는 webhook 응답 body나 내부 예외 message 대신 안전한 한국어 오류와 재시도 동작을 표시한다

### Requirement: Universal feedback form accessibility and state

**Authority / Provenance:** `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487` — The protected `/feedback` screen on Android/iOS/Web MUST provide the feedback kind, body, and submit control using React Native primitives and semantic theme tokens. It MUST render the feedback form directly without the legacy `/menu` introduction, description, or login-test link. UI labels, headings, and buttons MUST use `SUIT`, while the long feedback-body input MUST use `Pretendard`. Error, success, disabled, and busy states MUST be exposed to assistive technology without relying on visual presentation alone.

#### Scenario: Render the feedback form on every client

- **WHEN** 로그인한 Android/iOS/Web 사용자가 `/feedback`을 연다
- **THEN** 시스템은 네 feedback 종류, 본문 input과 submit control을 렌더링한다
- **AND** touch target, label, heading과 상태는 접근 가능한 semantics를 제공한다
- **AND** 기존 메뉴 소개와 로그인 테스트 UI를 렌더링하지 않는다

#### Scenario: Announce feedback status

- **WHEN** 제출이 진행 중이거나 성공 또는 실패로 완료된다
- **THEN** 시스템은 현재 상태를 접근 가능한 한국어 status로 알린다

#### Scenario: Share the feedback form across platforms

- **WHEN** Android, iOS 또는 Web 앱이 `/feedback` 화면을 렌더링한다
- **THEN** 시스템은 동일한 보호 route와 feedback form을 노출한다
- **AND** 각 플랫폼의 기존 인증·navigation transport를 재사용한다

### Requirement: Feedback secret injection and production smoke

**Authority / Provenance:** `PROD-479`, `PROD-487` — The deployment environment MUST inject `SLACK_FEEDBACK_WEBHOOK_URL` as a secret only into the API runtime and MUST NOT include it in the client bundle or Relay payload. The 2026-07-29 production verification MUST submit real Web feedback with an authenticated smoke account and confirm one successful Slack message, a safe payload, and the UI success state.

#### Scenario: Inject the webhook secret into the API

- **WHEN** API가 production 배포 환경에서 시작한다
- **THEN** `SLACK_FEEDBACK_WEBHOOK_URL`은 API process environment에서만 사용할 수 있다
- **AND** Expo public environment, generated GraphQL schema와 Web asset에 secret 값이 포함되지 않는다

#### Scenario: Start the API without optional feedback configuration

- **WHEN** API process에 `SLACK_FEEDBACK_WEBHOOK_URL`이 설정되지 않았다
- **THEN** API Pod는 다른 API 기능을 제공할 수 있도록 시작한다
- **AND** feedback mutation만 안전한 delivery unavailable 오류를 반환한다

#### Scenario: Run the production delivery smoke

- **WHEN** 운영자가 production Web에서 인증된 smoke account로 식별 가능한 비민감 test feedback을 제출한다
- **THEN** Web UI는 성공 상태를 표시한다
- **AND** 지정 Slack channel에는 해당 요청의 message 한 건이 나타난다
- **AND** message에는 제출 Account 내부 ID가 나타난다
- **AND** message에는 Account `displayName`, 이메일, OIDC subject, session ID와 선택되지 않은 다른 Profile 정보가 없다
- **AND** 관찰 가능한 log에는 webhook URL, token, cookie, Account 내부 ID와 예상하지 못한 오류 세부가 없다
