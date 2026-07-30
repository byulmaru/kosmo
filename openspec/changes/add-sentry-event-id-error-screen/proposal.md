## Why

현재 공용 오류 경계는 화면을 계속 사용할 수 없는 예상하지 못한 오류에도 일반 오류 문구와 재시도만 제공해, 사용자가 운영자에게 실제 Sentry event를 식별할 정보를 전달할 수 없다. Web 오류 수집 기반이 마련된 지금 공용 오류 UX와 Sentry event ID를 연결하고, Android·iOS는 native 수집 선행 작업 이후 같은 사용자 계약을 적용해야 한다.

## What Changes

- 화면 사용을 계속할 수 없는 예상하지 못한 오류에 Android·iOS·Web 공용 전용 오류 화면을 표시한다.
- 실제 Sentry event가 생성된 경우에만 해당 event ID를 opaque 사용자용 오류 추적 ID로 표시하고 복사할 수 있게 한다.
- Sentry 전송 실패나 ID 미발급 시에도 안전한 한국어 안내, 오류 경계 reset을 통한 다시 시도, 인증 상태와 무관한 공용 루트로 이동하는 복구 동작을 유지한다.
- validation·권한·예상된 GraphQL/domain 오류와 사용자가 현재 화면에서 복구할 수 있는 일시적 네트워크 오류는 전용 화면이나 새 Sentry event로 승격하지 않고 기존 좁은 inline 흐름을 유지한다.
- 한 오류를 nested React 경계와 platform Sentry 경계에서 중복 보고하지 않고, 오류 원문·stack trace·인증 정보·사용자 작성 콘텐츠를 화면에 노출하지 않는다.
- Web은 PROD-493의 수집 경계를 재사용하고 Android·iOS는 PROD-483이 제공할 native 수집 경계 뒤에 연결한다. 오류 화면의 ID 복사는 피드백 본문이나 Slack payload에 자동 연결하지 않으며 사용자가 필요할 때 수동으로 전달한다.

## Authority / Provenance

- Canonical: `docs/domain` 적용 없음(새 durable 도메인 객체·상태·행동 없음); `docs/design/accessibility.md`; `docs/design/colors.md`; `docs/design/typography.md`; `docs/design/breakpoints.md`
- Linear Contract: PROD-480
- Linear Implementations: PROD-485, PROD-486

## Capabilities

### New Capabilities

- `sentry-event-id-error-screen`: 예상하지 못한 화면 오류의 전용 universal 화면, 실제 Sentry event ID 표시·복사, 안전한 복구와 플랫폼별 검증 계약

### Modified Capabilities

- `react-error-boundary-composition`: 기존 일반 fallback 보존 요구를 전용 오류 화면, event ID 상태, 중복 없는 보고와 안전한 이동을 포함하는 복구 계약으로 확장한다.

## Impact

- `apps/app`의 GraphQL·route·session 오류 경계, 공용 오류 reporter context, 상태 화면과 Expo Router 복구 navigation
- Web Sentry wrapper의 event ID 반환 계약과 PROD-483 이후의 Android·iOS Sentry adapter
- Android·iOS·Web clipboard platform boundary 및 필요 시 Expo 호환 clipboard dependency
- 오류 경계 unit/Storybook 검증, Web·native runtime 검증, 실제 Sentry event ID 대응 운영 확인
- GraphQL schema, API·Web BFF 오류 응답, 구조화된 피드백 input과 Slack payload에는 변경 없음
