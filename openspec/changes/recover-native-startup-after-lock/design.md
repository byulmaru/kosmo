## Current Constraints

조사 기준은 최신 `main`과 동일한 `PROD-1138`의 `5b6df21c945fbcdeaf1328c2d912e2870994d038`이다.
아래 내용은 이 세션의 구현 제안이며, 제품 계약은 ADR 0032와 Linear가 소유한다.

| 초기 단계         | 현재 코드와 실패 전달                                                                                                                     | 복구 시 지킬 경계                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Native token 복원 | `RelayActorProvider.tsx:51`에서 `readSessionToken()`을 한 번 실행한다. 읽기 rejection이 발생하면 메모리에서 token이 없는 것으로 처리한다. | 잠금 중 저장소 읽기가 실제로 실패하는지 먼저 확인한다. 저장된 credential이 없다는 서버 확인과 혼동하지 않는다. |
| Session 조회      | `SessionProvider.tsx:211`의 `store-and-network` 조회가 실패하면 `RelayFailOpenBoundary`가 오류를 보고하고 자식 화면을 진행시킨다.         | 기존 auth·actor lifecycle과 확인된 Account identity를 보존한다.                                                |
| Shell 조회        | `UniversalShell.tsx:183`의 조회는 홈 `RouteBoundary` 밖에 있다. 루트까지 전파되면 앱 전체 fallback이 표시될 수 있다.                      | 실제 실패 operation 없이 Session 조회가 루트 오류의 직접 원인이라고 단정하지 않는다.                           |
| Home 조회         | `HomeTimelineScreen.tsx:168`의 조회는 `RouteBoundary`의 `fetchKey`로 재평가한다.                                                          | 홈 복구가 Session·shell·다른 actor Store를 재생성하지 않게 한다.                                               |

`relay/network.ts:25`는 요청을 한 번 보내고 fetch rejection을 `RelayTransportError`로 감싼다. HTTP 오류는
`GraphQLHttpError`로 구분한다. 이 transport와 초기 조회 경계에는 잠금·복귀 복구가 없다. 현재 AppState 구독은
작성기와 Native Push에 있지만 초기 조회를 복구하지 않는다.

기존 `AppProviders.test.ts`는 루트 수동 재시도의 runtime 재생성과 route-local 재시도를 검사하지만 query를 mock한다.
`RouteBoundary.relay.test.ts`는 실제 Relay Environment로 오류·수동 재시도·remount·늦은 응답을 검사한다.
조사한 파일에는 초기 조회의 AppState 전이를 실행하는 테스트가 없다. 이 세션에서는 동작 테스트를 실행하지 않았다.

## Practical Approach

1. 구현 세션에서 iOS와 Android 각각의 초기 네 단계를 재현한다. AppState 전이와 요청 시작·완료·실패·복구 시점을
   맞춰 기록한다. token·credential·요청 본문은 로그에 남기지 않는다. 잠금 전에 실패한 요청, 잠금 중 실패한 요청,
   복귀 후 늦게 실패한 요청, 복귀 후에도 pending인 요청을 구분한다.
2. fetch 중단이 확인되면 기존 Relay Network의 Native transport 경계에서 초기 조회에 한정한 복구를 우선 검토한다.
   잠금·복귀와 연결된 실패는 같은 조회에 자동 재전송 기회를 한 번만 주고, 성공한 원래 요청은 다시 보내지 않는다.
   요청의 variables·token·selected Profile과 응답을 받을 actor Environment의 소유권을 유지한다. mutation, HTTP·GraphQL
   응답 오류, 일반 foreground 요청, 정상 로딩 뒤의 갱신으로 범위를 넓히지 않는다.
3. 초기 조회의 범위와 AppState 구독 위치는 실제 호출 경계·재현에 맞춰 최소로 정한다. operation 이름만으로 앱의 모든
   조회에 정책을 적용하거나 별도 Relay pending/in-flight 관리 계층을 만들지 않는다. 이미 boundary에 오류가 전달된
   경로를 복구해야 한다면 표준 query reference/`fetchKey` 재평가와 기존 소유 경계를 사용한다. root 오류를 임의의
   query로 추측하거나 모든 복귀에서 runtime을 재생성하지 않는다.
4. 같은 중단 요청의 추가 자동 시도는 최대 1회다. 복귀 이벤트 중복이나 재시도 중 다시 잠그는 동작으로 그 횟수를
   되살리지 않는다. 복구 요청도 실패하면 기존 오류 경계로 전달하고 수동 재시도를 허용한다. 이미 끝난 초기 로딩의
   화면 복귀는 새 자동 복구의 근거로 사용하지 않는다.

이 접근은 재현 결과에 따라 줄이거나 바꿀 수 있다. SecureStore 읽기 오류나 요청이 끝나지 않는 경로가 실제 원인이라면
그 경계를 먼저 확인한다. 저장소 보안 옵션·세션 의미·일반 재시도 정책을 바꿔야 하면 그 결정만 사용자에게 확인한다.

## Alternatives and Traps

| 접근                                                     | 판단                                                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 초기 Native 조회의 transport에서 복귀 후 한 번 복구      | fetch 중단이 확인될 때 우선 검토한다. 오류가 UI에 확정되기 전에 회복하면 기존 query·Store를 유지할 수 있다. |
| Session·root·Home boundary에 각각 foreground 재시도 추가 | 실제로 오류가 확정된 경로를 복구할 때 검토한다. 중복 요청과 복구 횟수, 루트 remount의 영향에 주의한다.      |
| 모든 foreground 복귀에서 앱 runtime 전체 reset           | 현재 제안에서는 제외한다. 무관한 상태를 초기화하고 이미 성공한 조회와 mutation까지 재실행할 수 있다.        |

문구 일치만으로 연결 중단을 분류하거나 HTTP 504를 같은 원인으로 취급하지 않는다. 수동 root 재시도의 기존 runtime
재생성 계약과 query-local 복구의 Store 보존 계약은 서로 다르다.

## Risks / Limits

- iOS 제보·사용자 재현은 있으나, 이 세션에서 Native로 독립 재현하지 않았다. Android 재현 여부도 미확인이다.
- 원 제보의 OS·앱 빌드·OTA release·잠금 시간·발생률·수동 버튼 결과를 확보하지 못했다.
- `RelayActorProvider`의 저장소 읽기 rejection 처리도 조사 대상이다. 실제 잠금 실패의 원인이라고 확인한 것은 아니다.
- Sentry·PostHog 등 운영 telemetry는 새로 조회하지 않았다. 이슈의 과거 조회 결과를 현재 미발생의 근거로 쓰지 않는다.
- 새 dependency·API·DB 변경이나 migration은 현재 계획에 없다. 실제 diff와 필요한 rollout은 구현 시 다시 확인한다.
- 이 변경의 rollback은 구현 PR의 scoped 복구 코드를 되돌리는 방향으로 검토하되, 구체적인 방법은 실제 diff가 나온 뒤 정한다.

## Open Questions

제품·보안·소유권에 관한 미결정 사항은 없다. 자동 1회 후 기존 오류·수동 재시도는 사용자에게 확인했다.
실제 실패 operation, AppState와 오류의 순서, 플랫폼별 원인과 가장 작은 수정 위치는 구현 세션의 재현 과제다.

참고 자료: [React Native 0.85 AppState](https://reactnative.dev/docs/0.85/appstate),
[Expo SDK 56 SecureStore](https://docs.expo.dev/versions/v56.0.0/sdk/securestore/),
[Relay error states](https://relay.dev/docs/guided-tour/rendering/error-states/).
AppState만으로 화면 잠금의 원인을 식별할 수 있다고 가정하지 않는다. iOS와 Android의 실제 전이를 각각 기록한다.
