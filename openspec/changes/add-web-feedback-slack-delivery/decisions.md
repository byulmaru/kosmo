## Context

이 기록은 `PROD-479`의 cross-platform feedback 계약 중 `PROD-487`이 소유하는 Android/iOS/Web 공용 UI와 인증 server delivery slice를 구현하기 위한 durable choice를 정리한다. 제품 행동은 최신 Linear 본문과 적용되는 디자인·frontend 기준에서 독립적으로 확인했으며, 특히 Slack 성공 확인·retry·중복 허용 범위는 2026-07-28 사용자 선택을 Linear에 먼저 반영한 뒤 기록했다.

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
- Context / Problem: Android/iOS/Web 클라이언트가 같은 API server boundary를 재사용해야 한다. 제품은 로그인 account만 요구하며 선택 Profile은 요구하지 않는다.
- Decision Outcome: API는 `submitFeedback` GraphQL mutation을 `login` scope로 제공한다. Web Relay는 기존 cookie-to-Bearer BFF bridge를 사용하고 Android/iOS는 기존 bearer transport를 사용하며, 선택 Profile이 없는 유효한 session도 허용한다.
- Alternatives Considered: Web BFF 전용 REST endpoint는 native와 transport를 분리하므로 제외했다. API REST endpoint는 기존 client data layer를 우회하므로 제외했다. `usingProfile` scope는 제품보다 강한 precondition을 추가하므로 제외했다.
- Consequences: GraphQL schema와 Relay operation이 추가되지만 별도 client 인증 경계는 필요 없다. Payload는 persisted entity를 반환하지 않고 제출 완료만 표현한다.
- Confirmation / Follow-up: Anonymous, selected-Profile 없음, valid session과 BFF forwarding 경로를 GraphQL/app test로 검증한다.

### Feedback input과 Sentry event ID를 좁은 공개 계약으로 제한한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: Linear는 네 feedback 의도, 본문, BUG 전용 선택적 Sentry 추적 ID와 payload 제한의 정밀화를 요구하지만 exact GraphQL shape와 길이는 고정하지 않았다.
- Decision Outcome: Category는 `POSITIVE`, `NEGATIVE`, `FEATURE_REQUEST`, `BUG_REPORT` enum으로 제한한다. Body는 trim 후 1~2,000자이고, BUG_REPORT의 선택적 Sentry event ID는 대소문자를 허용하는 32자 hexadecimal 입력을 lowercase로 정규화한다. Non-bug category의 event ID는 거부한다.
- Alternatives Considered: Free-form category는 팀 분류 계약을 잃으므로 제외했다. Slack 권장 text 상한까지 4,000자를 허용하는 방식은 block payload와 abuse surface를 불필요하게 늘려 제외했다. Event ID를 무검증 string으로 받는 방식은 잘못된 추적값을 늘려 제외했다.
- Consequences: UI와 API가 같은 경계를 검증하고 malformed input은 Slack을 호출하지 않는다. `PROD-486`이 제공할 실제 Sentry event ID 형식과 호환된다.
- Confirmation / Follow-up: Boundary value, trim, category/event-ID 조합과 lowercase normalization test로 확인한다.

### Feedback 계약에서 Sentry event ID를 제외한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: Sentry event ID는 일반 사용자가 이해하거나 안정적으로 제공할 수 있는 입력이 아니며, 최신 제품 결정은 피드백 흐름에서 Sentry event 연결 자체를 제외한다.
- Decision Outcome: Feedback 공개 input과 Android/iOS/Web form은 종류와 1~2,000자 본문만 받는다. API는 Sentry event ID를 검증·정규화·전달하지 않고 Slack payload에도 포함하지 않는다.
- Alternatives Considered: 사용자 직접 입력과 자동 event 연결은 모두 피드백 계약에서 Sentry 전송을 유지하므로 제외했다.
- Consequences: 버그 피드백은 다른 종류와 같은 본문 중심 계약을 사용하며 Sentry event와 상호 참조되지 않는다.
- Confirmation / Follow-up: GraphQL schema, 클라이언트 form, Slack payload와 관련 test에서 Sentry event ID가 제거됐는지 검증한다.

### Incoming Webhook secret과 plain-text Slack payload를 API가 소유한다

- Decision Date: 2026-07-28
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: Webhook credential과 사용자 content를 client·log·Slack markup injection에서 격리하면서 지정 channel에 읽기 쉬운 message를 전달해야 한다.
- Decision Outcome: API는 optional `api-env` Secret의 `SLACK_FEEDBACK_WEBHOOK_URL`만 사용하고 HTTPS `hooks.slack.com` Incoming Webhook 형태를 fail-closed로 검증한다. Secret 누락은 API Pod 기동이 아니라 feedback mutation만 실패시킨다. Payload는 user content가 없는 fallback text와 category, source Web, body의 plain-text Block Kit field로 구성하고 unfurl을 끈다. Account/session/Profile identity와 upstream response body는 포함하거나 기록하지 않는다.
- Alternatives Considered: Client direct webhook은 secret을 노출하므로 제외했다. Bot token과 `chat.postMessage`는 현재 webhook scope를 확대하므로 제외했다. User content를 mrkdwn fallback에 포함하는 방식은 mention·formatting injection surface를 키워 제외했다.
- Consequences: Channel은 Slack app의 Incoming Webhook 설정이 소유한다. Missing/invalid secret은 mutation만 fail closed로 실패하고, feedback content와 credential은 DB나 exported asset에 남지 않는다.
- Confirmation / Follow-up: Helm render, missing/invalid config test, stubbed fetch payload snapshot, secret-redaction search와 production Slack smoke로 확인한다.

### Feedback webhook secret은 배포 환경에서 API process에 별도 구성한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-487`, PR #390 review
- Status: Superseded
- Context / Problem: Feedback 구현이 Helm에 전용 Vault 경로와 `api-env` Secret을 추가했지만, 리뷰에서 이 기능 PR이 새 배포 Secret 리소스를 소유하지 않도록 범위를 정정했다. Web과 API가 함께 읽는 기존 공용 `env`에 webhook을 넣으면 client runtime까지 credential이 확산될 수 있다.
- Decision Outcome: API는 process environment의 `SLACK_FEEDBACK_WEBHOOK_URL`을 fail-closed로 읽되, 이 변경은 Helm에 전용 Vault 경로나 Secret을 추가하지 않는다. Production smoke 전에 배포 환경이 API process에만 webhook을 별도로 구성하며, 환경 변수 누락은 API 기동이 아니라 feedback mutation만 실패시킨다.
- Alternatives Considered: 기존 `api-env` VaultStaticSecret 추가는 리뷰에서 제거하기로 했다. 공용 `env` Secret 재사용은 Web runtime에도 webhook을 전달하므로 제외했다.
- Consequences: Repository chart만으로 production webhook 주입을 완료하지 않으며, 운영 환경 구성은 production smoke의 선행 조건이다. API·client 코드의 secret 경계와 missing configuration fail-closed 동작은 유지한다.
- Confirmation / Follow-up: Helm diff에 feedback 전용 Secret 리소스가 없는지, missing/invalid config test와 client secret 비노출을 확인하고, 별도 운영 환경 구성을 포함한 production Slack smoke를 수행한다.

### 기존 공용 `env` Secret을 사용하되 API delivery만 webhook을 소비한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-487`, PR #390 review
- Status: Active
- Context / Problem: 실제 Helm chart는 기존 Vault `env` Secret을 API와 Web Rollout에 `envFrom`으로 전달하고, 별도 `api-env` Secret을 사용하지 않는다. 이전 기록의 API 전용 별도 주입 가정은 현재 배포 계약과 운영 문서를 어긋나게 한다.
- Decision Outcome: `SLACK_FEEDBACK_WEBHOOK_URL`은 기존 공용 `env` Secret에 구성한다. API delivery 애플리케이션만 이 값을 읽어 Slack 전달에 사용하며, Web process는 값을 application input이나 browser asset으로 읽거나 노출하지 않는다. 이 변경은 전용 Vault 경로나 Secret을 Helm에 추가하지 않고, 값이 없으면 feedback mutation만 fail closed로 실패시킨다.
- Alternatives Considered: 별도 `api-env` VaultStaticSecret과 전용 Helm 주입은 이 PR의 배포 리소스 소유 범위를 넓히므로 제외했다. 공용 Secret을 사용하면서 Web bundle과 Relay에 값을 넣는 방식은 secret 경계를 깨므로 제외했다.
- Consequences: 운영 환경은 기존 공용 `env` Secret에 webhook key를 구성해야 하며, Helm chart는 API·Web Rollout의 공용 `envFrom` 계약을 유지한다. Web runtime에 환경 변수가 전달될 수 있어도 Web application과 browser asset에는 credential이 노출되지 않는다.
- Confirmation / Follow-up: API·Web Rollout의 `envFrom: env`와 Vault destination을 Helm render에서 확인하고, API delivery 소비 경로·Web bundle·Relay payload에 실제 secret 값이 노출되지 않는지 검증한다. Production Slack smoke에서 성공 메시지와 safe payload를 확인한다.

### Slack payload에서 제출 Account와 선택 Profile을 제한적으로 식별한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-479`, `PROD-487`
- Status: Active
- Context / Problem: 팀이 Slack에서 피드백 제출자를 구분하려면 실행 환경 source보다 Kosmo identity가 필요하다. 최신 제품 결정은 Account 내부 ID와 선택 Profile의 공개 표현만 허용하고, 닉네임은 Account가 아니라 Profile `displayName`을 사용한다.
- Decision Outcome: Payload에서 source field를 제거한다. 제출 Account 내부 ID를 포함하고, 선택 Profile이 있으면 내부 ID, `displayName` 닉네임과 `relativeHandle`을 plain-text field로 포함한다. 선택 Profile이 없으면 Profile 정보가 없음을 표시하고 제출은 계속 허용한다. Account `displayName`, 이메일, OIDC subject, session identity와 선택되지 않은 다른 Profile 정보는 포함하지 않는다.
- Alternatives Considered: `출처: Web`은 client platform과 무관한 identity 계약에서 식별 가치가 없어 제외했다. Account `displayName`을 닉네임으로 보내는 방식은 사용자가 정정한 Profile 정체성과 다르므로 제외했다. 이메일·OIDC subject와 모든 Profile 목록은 목적보다 넓은 개인정보이므로 제외했다.
- Consequences: Slack message는 제출 Account와 현재 선택 Profile을 식별할 수 있다. Resolver는 검증된 session identity에 해당하는 Profile 표현을 조회해야 하지만 GraphQL input과 client payload는 바뀌지 않는다.
- Confirmation / Follow-up: 선택 Profile 유무별 payload, source field 부재, 허용되지 않은 Account/Profile 필드 부재와 기존 secret redaction을 API test 및 production smoke로 확인한다.

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

### `/feedback`을 canonical Web feedback route로 사용하고 메뉴 소개 UI를 제거한다

- Decision Date: 2026-07-29
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: 최초 구현은 기존 `/menu` placeholder에 feedback form을 추가했지만, 해당 URL과 KOSMO eyebrow·메뉴 제목·설명·login-test UI가 전용 피드백 화면의 정보 구조와 맞지 않는다는 사용자 정정이 있었다. Shared sidebar footer를 무조건 바꾸면 `PROD-488`의 native scope를 선행 구현한다.
- Decision Outcome: Web full/compact sidebar와 mobile drawer의 기존 설정·지원 위치를 canonical `/feedback`의 "피드백 보내기" Link로 바꾸고, `/feedback`에서는 feedback form만 직접 노출한다. 기존 `/menu` 소개 UI는 제거하고 `/menu` 접근은 `/feedback`으로 전환한다. Native navigation과 form 노출은 변경하지 않는다.
- Alternatives Considered: 기존 `/menu`에서 form을 유지하는 방식은 사용자가 요청한 URL과 전용 화면 구조를 충족하지 않아 제외했다. `/menu` 전체를 모든 platform에서 즉시 feedback으로 바꾸는 방식은 native issue boundary를 침범하므로 제외했다. Modal-only form은 canonical URL과 retryable screen state를 약화해 제외했다.
- Consequences: 전용 URL과 단순한 피드백 화면을 제공하면서 기존 protected guard와 drawer-close behavior를 재사용한다. 기존 `/menu` 링크는 canonical `/feedback`으로 이동한다. `PROD-488`은 같은 route/component 경계를 native에 활성화하고 검증할 수 있다.
- Confirmation / Follow-up: Full/compact/drawer navigation, active semantics, drawer close, Web form과 native unchanged scenario를 component/Storybook/E2E로 검증한다.

### `/feedback`을 canonical Web feedback route로 사용하고 기존 `/menu`는 보존한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: `/feedback`은 전용 피드백 화면이어야 하지만, 기존 프로필·팔로워 요청·프로필 설정 항목도 `/menu`를 destination으로 사용한다. `/menu`를 `/feedback`으로 redirect하면 이 소비자들이 피드백 화면으로 이동하는 회귀가 발생한다.
- Decision Outcome: Web shell의 "피드백 보내기" 진입점은 canonical `/feedback`을 직접 가리키고, `/feedback`은 기존 메뉴 소개·설명·login-test UI 없이 form만 렌더링한다. `/menu`는 redirect하지 않고 기존 메뉴 화면과 UI를 보존한다. 이후 공용 Android/iOS/Web 결정으로 대체되었다.
- Alternatives Considered: `/menu`를 `/feedback`으로 redirect하는 방식은 기존 route 소비자를 깨뜨려 제외했다. `/menu`에 form을 유지하는 방식은 전용 URL과 화면 구조를 충족하지 않아 제외했다.
- Consequences: `/menu`와 `/feedback`이 독립된 protected route로 남고, sidebar feedback link만 `/feedback`으로 이동한다. 피드백 화면은 단순한 정보 구조를 유지하면서 기존 메뉴 소비자의 destination을 보존한다.
- Confirmation / Follow-up: Full/compact/drawer의 `/feedback` navigation과 active semantics, `/menu`의 기존 heading·UI 렌더링, 두 route의 독립성을 component/Storybook/E2E로 검증한다.

### Android/iOS/Web에서 동일한 `/feedback` route와 shell navigation을 사용한다

- Decision Date: 2026-07-29
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`
- Status: Superseded
- Context / Problem: `PROD-487`의 확정 범위가 제한된 플랫폼 구현에서 인증된 Android/iOS/Web 공용 피드백으로 확대되었고 별도 플랫폼 slice가 취소되어 추가 분할이 필요하지 않다. `/feedback`은 보호된 canonical route로, `/menu`는 기존 소비자를 위해 독립 route로 유지해야 한다.
- Decision Outcome: Android/iOS/Web의 공용 `(tabs)/(protected)/feedback` route는 동일한 피드백 form과 GraphQL 제출 계약을 렌더링한다. 모든 플랫폼의 full/compact sidebar와 mobile drawer footer는 "피드백 보내기" Link를 `/feedback`으로 제공하고 현재 위치를 active/page-current로 노출한다. `/menu`는 redirect하지 않고 기존 화면과 UI를 보존한다.
- Alternatives Considered: 플랫폼별 route·form을 분리하면 인증·검증·상태 계약이 중복되어 제외했다. 일부 플랫폼만 entry를 제공하고 native 후속 구현을 두는 방식은 최신 `PROD-487` 범위와 맞지 않아 제외했다.
- Consequences: Android/iOS/Web이 동일한 route, form과 shell semantics를 공유하며 별도 native 구현 slice가 없다. 각 플랫폼의 기존 authenticated transport와 drawer close 동작은 유지한다.
- Confirmation / Follow-up: Full/compact/drawer navigation, active semantics, drawer close, `/menu`·`/feedback` 독립성 및 각 플랫폼의 form state를 component/Storybook/E2E로 검증한다. Native device harness가 없으면 해당 검증 공백을 결과에 기록한다.

### PROD-541 이후 Android/iOS/Web에서 `/feedback` navigation만 독립적으로 유지한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-487`, `PROD-541`
- Status: Active
- Context / Problem: PROD-487 구현 뒤 PROD-541이 남은 소비자가 없는 generic `/menu` placeholder와 준비되지 않은 sidebar 진입점을 제거했다. Parent feedback change가 과거 `/menu` 보존 시나리오를 유지하면 이후 archive 시 canonical의 route 제거 계약과 다시 충돌한다.
- Decision Outcome: Android/iOS/Web의 공용 `(tabs)/(protected)/feedback` route, 동일한 feedback form과 GraphQL 제출 계약, full/compact/mobile shell의 "피드백 보내기" link와 active·drawer-close semantics를 유지한다. Parent feedback change는 `/menu` route나 기존 메뉴 UI의 보존을 요구하지 않는다.
- Alternatives Considered: stale `/menu` 시나리오를 parent archive 직전까지 유지하고 별도 task로만 추적하는 방식은 이미 확정된 canonical과 active delta의 의미 충돌을 계속 남겨 제외했다. PROD-541 child가 parent requirement 전체를 수정하는 방식은 두 change의 production acceptance와 archive 책임을 다시 결합하므로 제외했다.
- Consequences: PROD-487의 feedback navigation·form·delivery 계약과 production smoke는 그대로 유지하면서, parent archive가 PROD-541의 `/menu` 제거를 되돌리지 않는다. `/menu` 제거 자체의 구현·검증·archive 증거는 PROD-541이 계속 소유한다.
- Confirmation / Follow-up: Parent delta의 `/menu` 보존 시나리오와 stale task 문구를 제거하고, scoped·전체 strict validation으로 canonical과의 정합성을 확인한다. Native device harness 공백과 production smoke task 4.3은 기존 PROD-487 범위에 남긴다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-28 `Account별 비영속 fixed-window와 in-flight guard를 사용한다`는 2026-07-29 `같은 account의 진행 중 delivery만 process-local로 차단한다`로 대체했다.
- 2026-07-28 `Feedback input과 Sentry event ID를 좁은 공개 계약으로 제한한다`는 2026-07-29 `Feedback 계약에서 Sentry event ID를 제외한다`로 대체했다.
- 2026-07-28 `Incoming Webhook secret과 plain-text Slack payload를 API가 소유한다`의 identity 비노출 payload 결정은 2026-07-29 `Slack payload에서 제출 Account와 선택 Profile을 제한적으로 식별한다`로 대체했다. `api-env` 배포 결정은 2026-07-30 `Feedback webhook secret은 배포 환경에서 API process에 별도 구성한다`로 대체되었고, 해당 별도 구성 결정은 다시 2026-07-30 `기존 공용 env Secret을 사용하되 API delivery만 webhook을 소비한다`로 대체했다. API secret 소비와 plain-text·unfurl 비활성화 결정은 유지한다.
- 2026-07-29의 기존 `/menu` → `/feedback` redirect 결정은 `/feedback`을 canonical Web feedback route로 사용하면서 기존 `/menu`는 보존하는 결정으로 대체했다.
- 2026-07-29 `/feedback을 canonical Web feedback route로 사용하고 메뉴 소개 UI를 제거한다`는 Android/iOS/Web에서 동일한 `/feedback` route와 shell navigation을 사용하는 결정으로 대체했다.
- 2026-07-29 `/feedback을 canonical Web feedback route로 사용하고 기존 /menu는 보존한다`는 Android/iOS/Web에서 동일한 `/feedback` route와 shell navigation을 사용하는 결정으로 대체했다.
- 2026-07-29 `Android/iOS/Web에서 동일한 /feedback route와 shell navigation을 사용한다`의 `/menu` 보존 부분은 PROD-541의 canonical route 제거에 따라 2026-07-30 `PROD-541 이후 Android/iOS/Web에서 /feedback navigation만 독립적으로 유지한다`로 대체했다.
