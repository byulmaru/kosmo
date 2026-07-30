## Context

`PROD-487`은 부모 `PROD-479`의 Android/iOS/Web 공용 구현 slice다. 현재 `apps/app`의 full/compact sidebar와 mobile drawer는 같은 sidebar component를 공유하며 footer의 "피드백 보내기" control은 보호된 `/feedback` route로 이동한다. `/feedback`은 기존 `/menu` placeholder의 KOSMO eyebrow, 메뉴 제목·설명과 login test link를 렌더링하지 않지만, 기존 프로필 관련 진입점이 사용하는 `/menu` route와 그 UI는 독립적으로 보존한다. 각 클라이언트는 기존 GraphQL 인증 경계를 사용하고, API의 `login` scope는 선택 Profile 없이도 유효한 account session을 식별한다.

현재 API runtime에는 Slack client나 feedback persistence가 없다. 배포 환경은 기존 공용 `env` Secret을 API와
Web Rollout에 전달하며 API delivery만 webhook 값을 소비한다. 이 변경은 전용 Helm Secret 경로를 추가하지
않으며, feedback secret 누락이 API 전체 기동을 막아서도 안 된다. Slack Incoming Webhook은 성공 또는 오류
응답을 반환하지만 멱등 key를 제공하지 않으므로, 사용자가 선택한 계약에 따라 server 자동 retry를 금지하고
모호한 실패 후 명시적 재시도의 드문 중복을 허용한다.

## Goals / Non-Goals

**Goals:**

- Android/iOS/Web shell의 모든 sidebar surface에서 보호된 `/feedback` form으로 진입한다.
- 로그인 account가 선택 Profile 유무와 관계없이 Relay GraphQL mutation으로 feedback을 제출한다.
- API가 입력을 검증하고 secret을 소유한 채 Slack Incoming Webhook으로 안전한 plain-text payload를 한 번 전송한다.
- DB persistence 없이 process-local in-flight guard와 client pending guard를 제공한다.
- 성공·실패·명시적 retry·접근성 상태와 production Slack smoke를 검증한다.

**Non-Goals:**

- feedback DB, outbox, 조회·관리 화면 또는 Slack-to-Linear 자동화
- 첨부, Session Replay, 사용자 행동 분석과 Slack 외 delivery channel
- Sentry event 연결
- 부모 `PROD-479`의 cross-platform 최종 통합, OpenSpec archive와 completion gate
- Slack Incoming Webhook 위에서 강한 exactly-once delivery를 구현하는 것
- 계정별 요청 횟수 제한(rate limit)을 구현하는 것

## Implementation Guidance

### Current Constraints

- `/feedback`은 `(tabs)/(protected)` 아래의 universal route로 두어 current-session query를 통한 보호 route 계약을 재사용한다. 별도 platform route tree나 BFF-owned UI를 만들면 universal route 정책을 어긴다.
- Sidebar component는 Android/iOS/Web과 full/compact/drawer surface가 공유하므로 동일한 feedback entry와 route semantics를 렌더링한다.
- Client data layer는 React Relay다. BFF에 ad hoc REST route를 추가하면 클라이언트가 재사용할 API 계약과 Web cookie bridge가 갈라진다.
- API context의 `login` scope는 account session을 제공하고 `usingProfile` scope는 선택 Profile을 추가로 요구한다. 제품 계약은 로그인만 요구하므로 `usingProfile`은 지나치게 좁다.
- Feedback record와 delivery metadata의 DB 영속화가 금지되므로, 전송 중 중복 차단 상태는 process memory에만 두고 완료 즉시 제거해야 한다.
- Incoming Webhook은 network timeout에서 Slack 수신 여부를 확정할 수 없다. server retry나 동일 input hash suppression은 각각 중복 위험 또는 정당한 반복 feedback 차단을 만든다.

### Recommended Approach

1. `/feedback` route 안에 feedback form을 직접 구성하고 모든 플랫폼에서 동일하게 노출한다. 기존 sidebar footer 위치는 `/feedback`으로 이동하는 "피드백 보내기" Link로 만든다. 기존 `/menu` 소개·설명·login-test UI는 `/feedback`에서 렌더링하지 않되, `/menu`는 redirect하지 않고 기존 화면으로 보존한다.
2. 기존 React Native form primitive와 theme token을 조합해 category selector, Pretendard multiline body와 submit status를 구성한다. Relay mutation은 form을 실제로 소유하는 component에 colocate한다.
3. `submitFeedback`은 API `login` scope의 GraphQL mutation으로 둔다. Input validation은 category enum과 trim된 body 1~2,000자를 한 경계에서 적용한다. 성공 payload는 persistence object를 가장하지 않고 제출 완료 사실만 반환한다.
4. API-local feedback delivery 경계가 account별 in-flight guard를 확인한 뒤 built-in `fetch`로 Incoming Webhook을 한 번 호출한다. In-flight state는 성공·실패와 관계없이 `finally`에서 즉시 제거해 memory leak과 영구 잠금을 피한다.
5. Webhook URL은 `SLACK_FEEDBACK_WEBHOOK_URL`에서만 읽고 HTTPS `hooks.slack.com` Incoming Webhook 형태인지 검증한다. Request에는 짧은 timeout을 적용하되 timeout, network error와 non-success response에서 다시 POST하지 않는다.
6. Slack top-level fallback은 user content 없이 새 feedback과 category만 식별한다. Block Kit은 category, body, 제출 Account 내부 ID와 선택 Profile의 내부 ID·`displayName` 닉네임·`relativeHandle`을 plain-text로 표현하고 source field와 unfurl을 뺀다. 선택 Profile이 없으면 그 사실만 표시하며 Account `displayName`, 이메일, OIDC subject, session identity, request headers와 다른 Profile 정보는 포함하거나 기록하지 않는다.
7. API test에서는 network를 호출하지 않고 fetch 경계를 stub해 auth, validation, payload, timeout, non-success와 concurrent flow를 검증한다. App story/test는 idle, invalid, pending, success, failure와 retry를 다루고 shared shell surface의 `/feedback` 이동과 Relay request state를 검증한다.
8. 배포 전에 기존 공용 `env` Secret에 secret을 설정하고 API delivery가 이를 소비하는지 확인한다. 배포 후
   전용 smoke account와 비민감 payload로 실제 Slack message 한 건과 UI 성공 상태를 확인하며, Web process와
   browser asset에는 값이 노출되지 않는지 검증한다. 절차와 확인 결과는 재현 가능한 운영 문서 또는 PR 검증
   기록에 남긴다.

### Allowed Alternatives

- API-local resolver가 작은 delivery module을 직접 사용하거나 resolver와 가까운 transport helper로 구성될 수 있다. GraphQL login scope, validation, secret ownership, 한 번의 webhook call과 비영속 제어 계약을 모두 보존해야 한다.
- In-flight guard는 account ID의 `Set` 또는 동등한 process-local 구조를 사용할 수 있다. 완료 즉시 상태를 제거하고 DB에 영속화하지 않는 동작은 같아야 한다.
- Feedback form은 `/feedback` route component 안에 둘 수도 있고 stateful child component로 분리할 수도 있다. Relay colocation과 Storybook 상태 검증을 유지해야 한다.

### Known Traps

- Slack URL을 Expo public environment, Relay input, client code 또는 generated asset에 넣지 않는다.
- Web BFF에 별도 feedback REST endpoint를 만들거나 client에서 Incoming Webhook을 직접 호출하지 않는다.
- 선택 Profile이 없는 로그인 사용자를 `usingProfile` scope로 거부하지 않는다.
- timeout이나 5xx를 server에서 자동 retry하지 않고, Slack response body 또는 webhook URL을 error/log에 넣지 않는다.
- User body를 mrkdwn top-level text나 mention이 활성화된 block에 넣지 않는다.
- Feedback content, idempotency record나 in-flight state를 DB에 추가하지 않는다.
- Input hash로 서로 다른 사용자의 의도적인 반복 feedback을 중복으로 간주하지 않는다.
- Android/iOS/Web에서 `/menu`와 `/feedback` route를 독립적으로 유지한다.

## Risks / Trade-offs

- [모호한 Slack network failure 뒤 명시적 retry가 duplicate message를 만들 수 있음] → server automatic retry를 금지하고 실패 input을 유지하며, 사용자가 선택한 best-effort 계약과 production smoke에서 동작을 확인한다.
- [Slack outage가 feedback 전달을 중단함] → success로 가장하지 않고 safe localized failure와 explicit retry를 제공한다.
- [User content가 Slack mention/link rendering 또는 민감정보 확산을 일으킴] → plain-text blocks, unfurl 비활성화, 2,000자 제한과 최소 field payload를 사용한다.
- [Webhook secret 누락 또는 잘못된 URL이 production에서만 드러남] → API는 환경 변수 누락에도 기동하고 feedback mutation만 fail closed로 처리하며, adapter test와 배포 전 API runtime 설정 확인, 실제 production smoke로 검출한다.

## Migration Plan

1. API schema, validation, process-local guard와 Slack adapter를 test double로 검증한다.
2. Android/iOS/Web `/feedback` form, shell navigation, Relay operation과 Storybook/E2E를 연결한다.
3. 배포 차트 변경 없이 기존 공용 `env` Secret에 `SLACK_FEEDBACK_WEBHOOK_URL`을 설정하고 API delivery가
   이를 소비하는지 확인한다. Web process와 client/exported assets에는 값이 노출되지 않는지 검증한다.
4. Web/API를 배포한 뒤 authenticated production smoke를 수행하고 지정 Slack channel의 single message와 safe payload를 확인한다.
5. 회귀가 발생하면 feedback entry와 mutation을 이전 revision으로 rollback한다. DB migration이 없으므로 data rollback은 없으며, 필요하면 API runtime 환경 변수를 제거해 delivery를 fail closed 상태로 중지한다.

## Open Questions

없음. 실제 webhook 값, 지정 channel과 smoke account는 repository 밖의 배포 parameter이며 구현 계약을 바꾸지 않는다.
