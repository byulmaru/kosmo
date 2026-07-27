## Why

Kosmo는 Web과 Native에서 현재 Session을 서버에서 폐기하고 runtime credential과 viewer 종속 상태를 안전하게 정리하는 종단 간 로그아웃 경로가 없다. 현재 Expo 로그아웃 버튼을 실제 동작에 연결하기 전에, 두 runtime이 같은 current-session revoke 계약과 결과 확정 규칙을 사용하도록 API·BFF·client 요구사항을 함께 정의해야 한다.

## What Changes

- 인증 경계가 식별한 현재 Active Session만 상태 수준에서 멱등하게 Revoked로 전이하는 transport-neutral core 동작을 추가한다.
- Native bearer client용 current-session revoke GraphQL mutation을 추가한다.
- Web HttpOnly session cookie를 사용하는 same-origin logout BFF를 추가하고, 폐기 또는 이미 인증 불가능한 상태가 확정된 응답에서만 cookie를 제거한다.
- 공용 Expo 로그아웃 버튼을 Web BFF와 Native GraphQL 경계에 연결하고, 성공이 확정된 뒤 credential과 viewer 종속 Relay 상태를 정리해 비인증 화면으로 전환한다.
- 결과 불명 실패에서는 credential과 기존 viewer 상태를 유지해 재시도할 수 있게 하고, 중복 실행을 방지하며 실패 상태를 접근 가능하게 표시한다.
- PROD-474와 PROD-475가 각자 구현·테스트를 소유하고 PROD-473이 두 결과의 종단 간 통합 검증과 OpenSpec archive를 소유하도록 작업 경계를 분리한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/session.md`, `docs/domain/objects/account.md`
- Linear Contract: `PROD-473`
- Linear Implementations: `PROD-474`, `PROD-475`
- Domain Gate: `PROD-344`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `session-auth`: 현재 Session 폐기, GraphQL 진입점, terminal 상태·경쟁·다른 Session 격리와 인증 실패 의미를 추가한다.
- `web-api-bridge`: Web logout BFF의 method·same-origin 보호·API 호출·HttpOnly cookie 제거 계약을 추가한다.
- `universal-expo-client`: Web과 Native의 runtime별 로그아웃 호출, credential·Relay 상태 정리, 실패·재시도와 비인증 전환 계약을 추가한다.
- `web-app-shell`: 기존 full/compact/drawer 로그아웃 control의 실행·진행·실패·접근성 동작을 추가한다.

## Impact

- `packages/core/services`의 Session application action과 기존 `session` state 저장 경계
- API request authentication context와 Session GraphQL mutation/schema·integration tests
- Web Hono BFF의 logout route, Origin 검증, upstream API 호출과 `kosmo_session` cookie response
- Expo React Relay network/actor environment, Native SecureStore token 경계, Session provider와 공용 shell logout control
- API schema와 Relay generated artifacts, core/API/BFF/client 단위·통합·Web smoke 검증
- 새 dependency나 database schema migration은 요구하지 않는다.
