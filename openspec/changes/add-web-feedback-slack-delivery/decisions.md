## Context

이 기록은 `PROD-479`의 cross-platform feedback 계약 중 `PROD-487`이 소유하는 Web UI와 인증 server delivery slice를 구현하기 위한 durable choice를 정리한다. 제품 행동은 최신 Linear 본문과 적용되는 디자인·frontend 기준에서 독립적으로 확인했으며, 특히 Slack 성공 확인·retry·중복 허용 범위는 2026-07-28 사용자 선택을 Linear에 먼저 반영한 뒤 기록했다.

## Decision Records

### 확인된 성공 요청과 명시적 재시도를 전달 보장으로 사용한다

- Decision Date: 2026-07-28
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Slack Incoming Webhook은 모호한 network failure에서 message 수신 여부를 확정할 멱등 계약을 제공하지 않으며, 제품은 feedback DB persistence를 금지하면서 실패 input 유지와 retry를 요구한다.
- Decision Outcome: Slack 성공 응답을 확인한 요청만 성공으로 처리하고 요청당 POST 한 번을 수행한다. Server는 자동 retry하지 않으며, 실패 input을 유지한 뒤 사용자가 명시적으로 재시도한다. 모호한 실패 후 재시도에서 드문 duplicate Slack message를 허용한다.
- Alternatives Considered: 강한 exactly-once를 위한 DB outbox/idempotency와 Slack Web API 권한 확대는 no-persistence 범위를 깨므로 제외했다. Server automatic retry는 duplicate risk를 숨기므로 제외했다.
- Consequences: UI는 upstream 오류를 성공으로 표시할 수 없고 explicit retry를 제공해야 한다. Duplicate 가능성은 제거되지 않지만 실패를 숨기거나 feedback content를 영속화하지 않는다.
- Confirmation / Follow-up: 사용자가 2026-07-28 현재 task에서 옵션 1을 명시적으로 선택했고, 같은 계약을 `PROD-479`과 `PROD-487` 본문에 반영했다. Timeout·non-success·명시적 retry test와 production smoke로 확인한다.

### Feedback submission은 login-scoped GraphQL mutation을 사용한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Web은 Relay와 same-origin BFF `/graphql`을 사용하고 후속 native slice가 같은 API server boundary를 재사용해야 한다. 제품은 로그인 account만 요구하며 선택 Profile은 요구하지 않는다.
- Decision Outcome: API는 `submitFeedback` GraphQL mutation을 `login` scope로 제공한다. Web Relay는 기존 cookie-to-Bearer BFF bridge를 사용하며 선택 Profile이 없는 유효한 session도 허용한다.
- Alternatives Considered: Web BFF 전용 REST endpoint는 native와 transport를 분리하므로 제외했다. API REST endpoint는 기존 client data layer를 우회하므로 제외했다. `usingProfile` scope는 제품보다 강한 precondition을 추가하므로 제외했다.
- Consequences: GraphQL schema와 Relay operation이 추가되지만 별도 Web 인증 경계는 필요 없다. Payload는 persisted entity를 반환하지 않고 제출 완료만 표현한다.
- Confirmation / Follow-up: Anonymous, selected-Profile 없음, valid session과 BFF forwarding 경로를 GraphQL/app test로 검증한다.

### Feedback input과 Sentry event ID를 좁은 공개 계약으로 제한한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Linear는 네 feedback 의도, 본문, BUG 전용 선택적 Sentry 추적 ID와 payload 제한의 정밀화를 요구하지만 exact GraphQL shape와 길이는 고정하지 않았다.
- Decision Outcome: Category는 `POSITIVE`, `NEGATIVE`, `FEATURE_REQUEST`, `BUG_REPORT` enum으로 제한한다. Body는 trim 후 1~2,000자이고, BUG_REPORT의 선택적 Sentry event ID는 대소문자를 허용하는 32자 hexadecimal 입력을 lowercase로 정규화한다. Non-bug category의 event ID는 거부한다.
- Alternatives Considered: Free-form category는 팀 분류 계약을 잃으므로 제외했다. Slack 권장 text 상한까지 4,000자를 허용하는 방식은 block payload와 abuse surface를 불필요하게 늘려 제외했다. Event ID를 무검증 string으로 받는 방식은 잘못된 추적값을 늘려 제외했다.
- Consequences: UI와 API가 같은 경계를 검증하고 malformed input은 Slack을 호출하지 않는다. `PROD-486`이 제공할 실제 Sentry event ID 형식과 호환된다.
- Confirmation / Follow-up: Boundary value, trim, category/event-ID 조합과 lowercase normalization test로 확인한다.

### Incoming Webhook secret과 plain-text Slack payload를 API가 소유한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Webhook credential과 사용자 content를 client·log·Slack markup injection에서 격리하면서 지정 channel에 읽기 쉬운 message를 전달해야 한다.
- Decision Outcome: API는 optional `api-env` Secret의 `SLACK_FEEDBACK_WEBHOOK_URL`만 사용하고 HTTPS `hooks.slack.com` Incoming Webhook 형태를 fail-closed로 검증한다. Secret 누락은 API Pod 기동이 아니라 feedback mutation만 실패시킨다. Payload는 user content가 없는 fallback text와 category, source Web, body, 선택적 event ID의 plain-text Block Kit field로 구성하고 unfurl을 끈다. Account/session/Profile identity와 upstream response body는 포함하거나 기록하지 않는다.
- Alternatives Considered: Client direct webhook은 secret을 노출하므로 제외했다. Bot token과 `chat.postMessage`는 현재 webhook scope를 확대하므로 제외했다. User content를 mrkdwn fallback에 포함하는 방식은 mention·formatting injection surface를 키워 제외했다.
- Consequences: Channel은 Slack app의 Incoming Webhook 설정이 소유한다. Missing/invalid secret은 mutation만 fail closed로 실패하고, feedback content와 credential은 DB나 exported asset에 남지 않는다.
- Confirmation / Follow-up: Helm render, missing/invalid config test, stubbed fetch payload snapshot, secret-redaction search와 production Slack smoke로 확인한다.

### Account별 비영속 fixed-window와 in-flight guard를 사용한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: Rate limit과 반복 제출 완화가 필요하지만 feedback 또는 delivery metadata의 DB persistence는 금지되고 현재 API 배포는 single replica다.
- Decision Outcome: API process는 account별 유효한 feedback 시도를 fixed window 10분당 5건으로 제한하고, 같은 account에 Slack request가 진행 중이면 concurrent request를 거부한다. Client도 pending 동안 submit을 막는다. Counter와 in-flight state는 process memory에만 두고 restart 뒤 복원하지 않는다.
- Alternatives Considered: DB/Redis-backed global limiter는 현재 persistence·dependency scope를 확대하므로 제외했다. IP-only limit는 shared network와 proxy에서 account contract보다 부정확해 제외했다. Body hash dedupe는 의도적인 동일 feedback을 차단하므로 제외했다.
- Consequences: 현재 single replica에서는 account abuse를 완화하지만 restart와 향후 multi-replica에서 global guarantee가 아니다. Upstream failure retry도 window를 소비한다.
- Confirmation / Follow-up: Five-attempt boundary, sixth rejection, concurrent request와 restart-independent unit behavior를 fake clock/fetch로 검증한다. Replica 확장 시 upstream contract와 store를 다시 결정한다.

### 같은 account의 진행 중 delivery만 process-local로 차단한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: 2026-07-29 리뷰에서 account별 횟수 제한을 현재 범위에서 제거하기로 제품 결정을 변경했다. 기존 fixed-window 구현은 account 수가 늘 때 매 요청마다 전체 상태를 순회하고, 여러 account의 부하는 제한하지 못한다.
- Decision Outcome: API는 같은 account의 Slack delivery가 진행 중일 때만 두 번째 delivery를 거부한다. In-flight account ID는 process-local `Set` 또는 동등한 구조에 두고 성공·실패 완료 시 즉시 제거한다. Account별 요청 횟수 제한과 rate history는 구현하거나 영속화하지 않는다.
- Alternatives Considered: 기존 5회/10분 fixed window는 O(N²) 누적 cleanup 비용과 제한 효과 불일치 때문에 제외했다. DB/Redis-backed global limiter는 최신 Linear 계약에 없고 현재 persistence·dependency 범위를 확대하므로 제외했다.
- Consequences: 같은 account의 concurrent duplicate POST는 막지만 순차 요청이나 여러 account의 부하는 제한하지 않는다. 장기 abuse protection이 필요하면 신뢰 가능한 별도 upstream 계약에서 결정해야 한다.
- Confirmation / Follow-up: 같은 account concurrent rejection, 완료 뒤 재시도 허용과 성공·실패 시 상태 해제를 unit test로 검증한다.

### 기존 `/menu`를 Web feedback 화면으로 사용하고 native 노출을 미룬다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Protected `/menu` route와 shared sidebar footer가 이미 존재한다. 별도 Web route tree는 universal client 기준을 어기며, shared component를 무조건 바꾸면 `PROD-488`의 native scope를 선행 구현한다.
- Decision Outcome: Web full/compact sidebar와 mobile drawer의 기존 설정·지원 위치를 `/menu`의 "피드백 보내기" Link로 바꾸고, `/menu`에서 Web에만 feedback form을 노출한다. Native navigation과 form 노출은 변경하지 않는다.
- Alternatives Considered: 새 `/feedback` route는 기존 placeholder route와 역할을 중복하므로 제외했다. `/menu` 전체를 모든 platform에서 즉시 feedback으로 바꾸는 방식은 native issue boundary를 침범하므로 제외했다. Modal-only form은 canonical URL과 retryable screen state를 약화해 제외했다.
- Consequences: 별도 route를 추가하지 않고 기존 protected guard와 drawer-close behavior를 재사용한다. `PROD-488`은 같은 route/component 경계를 native에 활성화하고 검증할 수 있다.
- Confirmation / Follow-up: Full/compact/drawer navigation, active semantics, drawer close, Web form과 native unchanged scenario를 component/Storybook/E2E로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-28 `Account별 비영속 fixed-window와 in-flight guard를 사용한다`는 2026-07-29 `같은 account의 진행 중 delivery만 process-local로 차단한다`로 대체했다.
