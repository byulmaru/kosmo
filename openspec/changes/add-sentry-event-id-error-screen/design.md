## Context

`apps/app`은 Android·iOS·Web이 Expo Router route tree와 React Native UI를 공유한다. 현재 `GraphQLErrorBoundary`와 `RouteBoundary`는 `react-error-boundary`로 오류를 포착해 `StateView` fallback을 렌더링하고, reset 뒤 Relay actor revision 또는 route-local fetch key를 바꿔 재조회한다. Web entry는 `UnexpectedErrorContext`에 Sentry reporter를 주입하지만 reporter 반환형이 `void`라 SDK가 생성한 event ID를 버린다. Native entry에는 PROD-483 범위를 선행하지 않도록 Sentry adapter가 없다.

현재 Relay network는 HTTP 실패를 message만 가진 `Error`로 평탄화하고, Relay는 `data: null`인 GraphQL 오류를 `RelayNetwork` 오류로 경계에 던질 수 있다. GraphQL·route 경계와 Web reporter는 오류 종류를 검사하지 않아 예상된 query·network 오류도 client Sentry에 보고될 가능성이 있다. Mutation의 validation·권한 오류는 다수 화면이 callback에서 inline 상태로 처리한다.

Sentry JavaScript SDK의 capture API는 전송 완료를 기다리지 않고 생성한 event ID를 동기적으로 반환한다. 따라서 UI는 SDK adapter가 현재 오류에 반환한 ID만 사용할 수 있지만, client만으로 개별 event의 원격 수락을 동기적으로 증명할 수는 없다. 배포 gate에서 화면 ID와 실제 Sentry event를 대조해야 한다.

기존 `ToastProvider`는 universal하고 접근 가능한 상태 알림을 제공한다. 반면 workspace에는 clipboard dependency나 공용 clipboard adapter가 없고, `/`는 guest redirect, logout과 not-found 복귀에 이미 사용하는 인증 독립 public root다.

## Goals / Non-Goals

**Goals:**

- 예상 오류와 화면을 사용할 수 없게 만드는 예상하지 못한 client 오류를 구조적으로 구분한다.
- 예상하지 못한 오류를 platform reporter에 한 번 보고하고 반환된 event ID를 전용 오류 화면에 연결한다.
- ID 발급·전송·clipboard 실패와 무관하게 다시 시도와 public 안전 화면 이동을 유지한다.
- 공용 React Native 화면을 공유하면서 Sentry·clipboard platform API만 adapter 경계에 둔다.
- Web과 Android·iOS의 서로 다른 선행 이슈와 runtime 검증 책임을 OpenSpec task에서 분리한다.

**Non-Goals:**

- Sentry SDK·project·DSN·source map/debug symbol·secret 경계를 새로 구축하거나 PROD-477·483·493 계약을 변경하는 작업
- API·Web BFF 오류 응답, server event ID 전달 또는 server symbolication 구현
- 예상 오류, validation·권한 실패와 모든 network 오류를 client Sentry에 수집하는 작업
- 오류 원문·stack·내부 경로·credential·사용자 콘텐츠를 사용자에게 노출하는 작업
- Sentry ID를 `/feedback` input, URL, navigation state 또는 Slack payload에 자동 연결하는 작업
- tracing, Session Replay, analytics 또는 Sentry 자체 User Feedback UI 도입

## Implementation Guidance

### Current Constraints

- 하나의 `UnexpectedErrorReporter`가 nested GraphQL·route·session 경계에 상속된다. 현재 모든 경계가 동일 reporter를 호출하므로 분류와 occurrence 단위 중복 방지를 공용 경계에서 일관되게 적용해야 한다.
- `GraphQLErrorBoundary`는 backend·network message를 사용자 설명에 그대로 전달한다. 전용 오류 화면에서 이 formatter를 재사용하면 Linear의 민감 정보 비노출 제약을 위반할 수 있다.
- HTTP 실패를 plain `Error`로 바꾸면 render 오류와 transport 오류를 message 이외의 근거로 구분할 수 없다. Relay의 `source.errors`에는 GraphQL extensions가 남을 수 있지만 partial data와 `data: null` 경로가 다르다.
- `react-error-boundary`의 `onError` 반환값은 fallback에 전달되지 않는다. reporter 결과를 오류 발생 건의 UI 상태로 연결하고 reset에서 제거하는 얇은 함수형 조합이 필요하다.
- Sentry capture API가 반환한 ID는 해당 SDK event에 사용한 식별자지만 네트워크 수락 확인은 아니다. UI render를 전송 대기나 Sentry API 조회에 묶으면 offline·전송 장애에서 fallback 자체가 불안정해진다.
- Web Sentry는 platform entry에서만 import한다. 공용 source가 `@sentry/react` 또는 향후 native SDK를 직접 import하면 PROD-483 이전 native bundle 경계를 깨뜨린다.
- `StateView`는 action 하나만 제공한다. 전용 화면은 copy·retry·safe navigation과 상태 알림을 함께 다뤄야 하므로 기존 단일 action API를 억지로 확장하면 일반 loading/empty/error state와 치명적 오류 책임이 섞일 수 있다.
- Android·iOS runtime event ID 검증은 PROD-483이 완료되기 전에는 수행할 수 없다. Web 완료 증거를 native 완료로 일반화할 수 없다.

### Recommended Approach

공용 오류 경계 앞에 구조화된 분류 단계를 두고, GraphQL response·Relay query·HTTP/network에서 온 예상 오류와 local render/runtime 오류를 message가 아니라 보존된 origin·type·code로 구분한다. Network 경계는 transport 실패와 GraphQL response metadata를 잃지 않는 app-owned 오류 표현을 사용하고, mutation의 기존 inline 처리에는 손대지 않는다. Server가 반환한 GraphQL 오류와 transport 실패는 가장 가까운 기존 route-local 상태에서 복구하고 client reporter로 보내지 않는다. 분류할 수 없는 render 예외는 예상하지 못한 오류로 취급하되 원문은 사용자 화면에 전달하지 않는다.

Platform-neutral reporter는 현재 오류와 React component stack을 받아 `event ID | 없음` 결과를 반환하게 한다. Web adapter는 기존 Sentry capture 호출의 반환값을 전달하고, adapter가 없거나 capture가 예외를 던지면 `없음`으로 안전하게 종료한다. Android·iOS는 PROD-483이 정의한 native adapter를 같은 contract에 맞춘다. 공용 경계 조합이 최초 처리한 오류 발생 건의 report 결과를 소유하고, nested 경계·재렌더가 같은 발생 건을 다시 보고하지 않게 한다. Reset에서는 오류·ID·copy 상태를 함께 지우고, reset 뒤 재발한 오류는 새 발생 건으로 처리한다.

예상하지 못한 오류 fallback은 별도 route로 navigation하지 않고 포착한 경계 안에서 공용 전용 오류 화면을 렌더링하는 것을 기본으로 한다. 그래야 `resetErrorBoundary`와 소유자 retry callback을 그대로 유지하고, route 자체가 실패한 상황에서도 오류 route를 추가로 해석하지 않는다. 안전한 이동은 현재 인증 상태와 무관한 public root `/`로 replace하여 실패한 route가 back stack에서 즉시 다시 열리지 않게 한다.

전용 화면은 theme·typography·spacing token을 사용하는 공용 React Native component로 두고 다음 상태를 표현한다.

- 고정된 안전한 한국어 title·description
- adapter가 반환한 경우에만 opaque event ID와 copy action
- 다시 시도와 public 안전 화면 이동
- 기존 universal toast를 재사용한 copy 성공·실패 announcement

Clipboard는 Expo runtime을 지원하는 단일 dependency를 app package에 pnpm으로 추가하고, 공용 화면은 작은 platform-neutral async adapter만 호출하는 방식을 권장한다. Adapter는 성공·실패만 반환하고 ID 외의 오류 세부를 UI로 전달하지 않는다. Web의 `navigator.clipboard` 직접 호출과 native 별도 UI를 만들지 않는다.

Component/Storybook 검증은 no-ID, ID, 긴 ID, copy success/failure, retry success/re-failure, guest-safe navigation, 좁은 Web viewport, keyboard와 text scaling 상태를 포함한다. Reporter 단위 검증은 structured expected 오류 제외, unexpected capture 한 번, returned ID 연결, adapter throw fallback과 reset dedupe를 확인한다. 실제 runtime gate는 Web(PROD-486)과 Android·iOS(PROD-485)가 각 platform의 화면 ID와 Sentry event를 독립적으로 대조한다.

### Allowed Alternatives

- 별도 전용 component 대신 기존 상태 primitive를 합성해도 specs의 action·민감 정보·접근성·occurrence 상태 경계를 모두 지키고 일반 state API에 Sentry 책임을 노출하지 않으면 허용한다.
- Expo 호환 clipboard package 대신 현재 지원 Expo SDK에서 Android·iOS·Web을 모두 제공하는 다른 유지보수되는 adapter를 사용할 수 있다. Web-only DOM API와 native UI 중복은 허용하지 않는다.
- Reporter 결과를 동기 optional ID가 아닌 비동기 result로 모델링할 수 있다. 이 경우 오류 화면은 ID pending 자체를 blocking loading으로 만들지 않고, 늦게 도착한 결과가 reset된 occurrence에 붙지 않도록 해야 한다.

### Known Traps

- `error.message`, GraphQL 한국어 문구 또는 문자열 정규식으로 expected/unexpected를 분류하지 않는다.
- 모든 `RelayNetwork` 이름을 곧바로 사용자 잘못으로 취급하지 않는다. `source.errors`, transport origin과 server 변환 계약을 보존해 client 중복 capture만 막는다.
- fallback render 안에서 Sentry side effect를 직접 실행하지 않는다. React 재렌더·Strict Mode·Storybook play 재실행이 같은 오류를 중복 보고할 수 있다.
- SDK event ID처럼 보이는 random UUID를 app에서 만들거나 이전 `lastEventId`를 읽어 현재 오류에 붙이지 않는다.
- Sentry 전송 완료를 기다리느라 오류 화면·retry를 block하거나 public client에서 Sentry read API token을 사용하지 않는다.
- raw 오류를 ID copy 실패 toast, accessibility label, console-derived description 또는 navigation parameter에 포함하지 않는다.
- `/home`을 무조건 안전 목적지로 쓰지 않는다. guest는 protected route redirect와 상호작용하므로 기존 public root를 사용한다.
- Web Storybook a11y 통과를 color contrast·Web runtime·VoiceOver·TalkBack 전체 검증으로 해석하지 않는다.

## Risks / Trade-offs

- [Sentry SDK ID 반환과 원격 event 수락 사이에 비동기 간극이 있다] → 앱은 SDK가 현재 capture에 반환한 ID만 표시하고 가짜 ID를 만들지 않으며, platform 배포 smoke에서 표시 ID로 실제 event를 조회한다. 전송 장애는 no-ID 또는 미전달 가능성으로 운영 검증에 기록하되 fallback을 실패시키지 않는다.
- [예상 query 오류의 기존 plain `Error` 평탄화가 구조적 분류를 어렵게 한다] → transport와 GraphQL response origin을 app-owned type/metadata로 보존하고 message는 표시용 fallback 외 분류 근거로 사용하지 않는다.
- [분류를 너무 넓게 expected로 두면 실제 client 결함을 누락할 수 있다] → server response·transport로 출처가 확인되는 오류만 client capture에서 제외하고 local render/runtime 예외는 기본적으로 unexpected로 둔다. 분류 회귀 fixture를 유지한다.
- [분류를 너무 좁게 두면 server/client 중복 event가 생긴다] → `INTERNAL_SERVER_ERROR`를 포함한 server GraphQL response는 client render event로 다시 capture하지 않고 platform integration에서 event 수를 확인한다.
- [Native blocker 때문에 change가 Web 배포 뒤에도 active로 남는다] → task ownership과 완료 evidence를 PROD-480·485·486으로 분리하고 parent archive는 두 platform slice와 통합 검증이 모두 끝난 뒤에만 수행한다.
- [clipboard dependency가 bundle과 권한 경계를 늘린다] → Expo 호환 최소 package를 pnpm으로 추가하고 ID string 쓰기만 감싼다. clipboard 실패는 local UI 상태로만 처리한다.

## Migration Plan

1. PROD-480 공용 slice에서 오류 origin 분류, optional event ID reporter contract, 전용 오류 화면과 clipboard adapter·component 검증을 추가한다. 기존 예상 오류 inline/route-local fixture를 먼저 고정한다.
2. PROD-486 Web slice에서 기존 PROD-493 Sentry adapter의 capture 반환 ID를 공용 contract에 연결하고 Web copy·retry·safe navigation, 중복 보고와 실제 event ID 대조를 검증한다.
3. PROD-483이 native Sentry 수집 경계를 제공한 뒤 PROD-485가 Android·iOS adapter와 device clipboard·접근성·event ID 대조를 검증한다.
4. PROD-480 통합 owner가 strict OpenSpec, 공용 Storybook/unit 회귀, Web·Android·iOS runtime evidence와 upstream 정합성을 확인하고 전체 change를 archive한다.
5. Rollback이 필요하면 platform reporter가 ID를 반환하지 않게 해 추적 ID·copy를 숨기고 기존 안전 안내·retry를 유지한다. DB·GraphQL schema·서버 migration은 없으며, dependency 제거는 모든 platform caller가 제거된 뒤 pnpm으로 수행한다.

## Open Questions

제품 또는 구현 선택으로 남은 질문은 없음. PROD-483 native 수집 완료와 PROD-477의 실제 배포 event 검증은 이 change 밖 선행 evidence이며, 각 task gate에서 최신 상태를 다시 확인한다.
