## Why

출시 초기 Web 사용자는 제품 안에서 장점·불편·필요한 기능·버그를 팀에 전달할 공식 경로가 없다. `PROD-487`은 2026-07-29 Web 배포에서 인증된 사용자의 피드백을 저장소 DB에 영속화하지 않고 지정 Slack 채널로 전달하는 end-to-end 경로를 제공한다.

## What Changes

- Web full/compact sidebar와 mobile drawer의 기존 설정·지원 위치를 직접적인 "피드백 보내기" 진입점으로 바꾸고 보호된 `/menu` 피드백 화면으로 이동할 수 있게 한다.
- 사용자가 좋았던 점·나빴던 점·필요한 점·버그를 선택하고 본문과 버그용 선택적 Sentry event ID를 입력하는 접근 가능한 상태 흐름을 추가한다.
- 로그인 세션을 요구하는 GraphQL 제출 계약과 server-owned Slack Incoming Webhook 전송 경계를 추가한다.
- 피드백 내용을 DB에 저장하지 않고, client의 진행 중 반복 제출 차단과 server의 동일 계정 동시 전송 차단을 적용한다. 계정별 요청 횟수 제한은 이번 범위에 포함하지 않는다.
- Slack 성공 응답을 확인한 요청만 성공 처리하고 server 자동 재전송은 하지 않는다. 모호한 실패에서는 입력을 유지해 사용자가 명시적으로 재시도할 수 있으며, 이 경우 드문 중복 가능성을 허용한다.
- webhook secret의 Vault 환경 주입, 안전한 Slack payload, 오류 정보 비노출과 production smoke 검증 절차를 정의한다.
- Android/iOS 메뉴·화면·앱 배포와 부모 `PROD-479`의 cross-platform 최종 통합·archive는 이번 변경에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, `memory/frontend-react-native.md`
- Linear Contract: `PROD-479`
- Linear Implementations: `PROD-487`

## Capabilities

### New Capabilities

- `web-feedback-delivery`: 인증된 Web 피드백 입력, 검증, GraphQL 제출, Slack 전달, 전송 중 중복 제한, 상태·재시도와 운영 검증 계약

### Modified Capabilities

- `web-app-shell`: Web sidebar와 drawer의 기존 설정·지원 위치가 "피드백 보내기" 링크로 바뀌어 보호된 `/menu` 화면으로 이동하고 현재 위치 semantics를 제공하도록 공통 shell 요구사항을 확장

## Impact

- `apps/app`: protected `/menu` route, shared Web shell navigation, React Native form 상태, Relay mutation, Storybook와 Web E2E
- `apps/api`: 로그인 scope GraphQL input/enum/mutation, 비영속 동시 전송 제어, Slack Incoming Webhook adapter와 단위·GraphQL 통합 테스트
- `apps/api/schema.graphql`: 새 feedback enum, input, payload와 mutation schema
- Vault/배포 환경: API runtime의 `SLACK_FEEDBACK_WEBHOOK_URL` secret
- 운영 검증: 인증 실패, 입력 제한, 성공·실패·동시 전송 차단, secret 비노출과 production Slack smoke
- DB schema, migration과 새 runtime dependency는 변경하지 않음
