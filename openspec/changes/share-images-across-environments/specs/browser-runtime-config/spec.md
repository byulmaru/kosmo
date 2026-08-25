## ADDED Requirements

### Requirement: Web browser는 렌더링 전에 공개 runtime config를 검증한다

**Authority / Provenance:** `PROD-833` — Web BFF는 allowlist된 공개 browser 설정을 `/runtime-config.json`에서 제공해야 하며 (MUST), Web entrypoint는 React tree, browser Sentry와 OpenPanel을 초기화하기 전에 이 응답을 로드하고 명시적 schema로 검증해야 한다 (MUST). Config는 environment, nullable browser Sentry DSN과 nullable OpenPanel client ID를 표현해야 하며 (MUST), server credential·session·database·confidential OIDC 값을 포함해서는 안 된다 (MUST NOT).

#### Scenario: 유효한 runtime config

- **WHEN** browser가 유효한 environment와 허용된 nullable telemetry 설정을 받는다
- **THEN** Web entrypoint는 검증된 config를 설치한 뒤 React tree와 활성화된 browser telemetry client를 초기화한다

#### Scenario: 허용되지 않은 설정 필드

- **WHEN** runtime config 응답이 schema에 없는 필드 또는 secret 성격의 값을 포함한다
- **THEN** client는 응답을 유효한 runtime config로 설치하지 않고 application 초기화를 중단한다

### Requirement: Runtime config 실패는 다른 환경으로 fail-open하지 않는다

**Authority / Provenance:** `PROD-833` — Runtime config request가 실패하거나 응답이 누락·malformed·invalid이면 Web client는 build-time 값, 이전 환경값 또는 임의 기본값으로 application을 실행해서는 안 되며 (MUST NOT), 사용자에게 재시도 가능한 명시적 초기화 실패 상태를 표시해야 한다 (MUST).

#### Scenario: Config endpoint 실패

- **WHEN** `/runtime-config.json` 요청이 성공 응답을 반환하지 않는다
- **THEN** client는 React application과 telemetry를 초기화하지 않고 초기화 실패 상태와 config 재시도 action을 표시한다

#### Scenario: Config schema 불일치

- **WHEN** endpoint가 JSON을 반환하지만 필수 environment 또는 허용된 nullable field의 type이 schema와 다르다
- **THEN** client는 다른 환경 설정을 추론하지 않고 같은 초기화 실패 상태를 표시한다

### Requirement: Runtime config는 환경 변경을 안전하게 반영한다

**Authority / Provenance:** `PROD-833` — Web BFF는 runtime config 응답에 `Cache-Control: no-store`를 설정해야 하며 (MUST), hashed Expo asset의 immutable cache·사전 압축 파일·SPA fallback을 수정해서는 안 된다 (MUST NOT). Browser Sentry와 OpenPanel enablement는 각각 현재 runtime config의 DSN과 client ID 유무로 결정해야 하며 (MUST), container 시작 시 packaged JavaScript·HTML·gzip 파일을 문자열 치환해서는 안 된다 (MUST NOT).

#### Scenario: 같은 image를 다른 환경에서 실행

- **WHEN** 동일한 Web image digest가 서로 다른 runtime config를 가진 dev와 prod에서 실행된다
- **THEN** 각 browser는 자신의 BFF가 반환한 environment와 telemetry 설정만 사용하고 packaged static asset bytes는 두 환경에서 동일하게 유지된다

#### Scenario: Static asset 재검증

- **WHEN** browser가 runtime config와 hashed Expo asset을 각각 요청한다
- **THEN** runtime config는 저장되지 않고 hashed asset은 기존 immutable cache와 deterministic precompression 계약을 유지한다

### Requirement: Web transport는 same-origin BFF를 유지한다

**Authority / Provenance:** `PROD-833` — Browser runtime config 전환 뒤에도 Web GraphQL, login과 logout은 현재 page origin의 Web BFF를 사용해야 하며 (MUST), runtime config가 browser에 별도 API origin 또는 confidential OIDC client credential을 전달해서는 안 된다 (MUST NOT).

#### Scenario: Browser GraphQL request

- **WHEN** runtime config가 설치된 Web app이 GraphQL operation을 실행한다
- **THEN** client는 현재 browser origin의 `/graphql`과 기존 cookie credential 경계를 사용한다

#### Scenario: Browser login 또는 logout

- **WHEN** Web 사용자가 login 또는 logout을 시작한다
- **THEN** client는 현재 browser origin의 BFF route를 사용하고 runtime config에서 native API·OIDC credential을 찾지 않는다

### Requirement: Native build-time configuration은 분리해서 유지한다

**Authority / Provenance:** `PROD-833` — Android와 iOS는 이번 변경에서 기존 build-time API origin, OIDC issuer와 native public client ID 계약을 유지해야 하며 (MUST), browser runtime config endpoint를 native session configuration source로 사용해서는 안 된다 (MUST NOT).

#### Scenario: Native application build

- **WHEN** Android 또는 iOS application artifact를 build한다
- **THEN** native API·OIDC 설정은 기존 Expo build 입력에서 결정되고 Web browser runtime config 전환의 영향을 받지 않는다
