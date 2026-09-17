# native-error-observability Specification

## Purpose

Android·iOS Native 앱의 처리되지 않은 오류를 개인정보 최소화 경계와 release·source map·debug symbol 연결을 유지하며 수집하는 계약을 정의한다.

## Requirements

### Requirement: Android·iOS의 처리되지 않은 오류를 수집한다

**Authority / Provenance:** PROD-477, PROD-483. 시스템은 production Android·iOS 앱의 처리되지 않은 React 및 native runtime 오류를 기존 오류 UI 동작을 바꾸지 않고 Sentry에 수집해야 한다(MUST). 각 event는 실행 환경과 배포 release를 식별할 수 있어야 한다(MUST).

#### Scenario: 처리되지 않은 React 오류

- **WHEN** production Android 또는 iOS 앱의 React 오류 경계가 처리되지 않은 오류를 소비한다
- **THEN** 시스템은 기존 fallback과 재시도 동작을 유지하며 오류를 해당 환경과 release의 Sentry event로 수집한다

#### Scenario: Native runtime 오류

- **WHEN** production Android 또는 iOS runtime에서 처리되지 않은 오류가 발생한다
- **THEN** 시스템은 해당 platform, 환경과 release를 식별할 수 있는 Sentry event를 수집한다

### Requirement: Native Relay GraphQL 전송 거절은 Native React 오류 경계에서 재수집하지 않는다

**Authority / Provenance:** `docs/operations/sentry.md`, PROD-477, PROD-483. Native Relay GraphQL 요청이 HTTP 응답을 받기 전에 오프라인 상태, timeout, DNS 또는 TLS 오류 등 연결 실패로 거절되면 Native React 오류 경계의 Sentry reporter가 이를 다시 수집해서는 안 된다(MUST NOT). 이 제외는 HTTP 응답 이전의 Relay 전송 거절에만 적용되어야 하며(MUST), 기존 fallback·재시도 동작을 바꾸지 않아야 한다(MUST NOT).

#### Scenario: HTTP 응답 전 연결 실패

- **WHEN** Native Relay GraphQL 요청이 HTTP 응답을 받기 전에 연결 실패로 거절되고 Native React 오류 경계가 이를 소비한다
- **THEN** Native React 오류 경계는 기존 fallback·재시도 동작을 유지하며 해당 거절을 Sentry event로 다시 수집하지 않는다

#### Scenario: 응답 또는 예상하지 못한 React 오류

- **WHEN** Native Relay 요청이 HTTP 응답을 받았거나 GraphQL `errors` payload, 응답 JSON 파싱 실패 또는 그 밖의 예상하지 못한 Native React render/runtime 오류가 발생한다
- **THEN** 기존 Native React 오류 경계 Sentry reporting은 해당 오류를 계속 관측한다

#### Scenario: 명시적으로 처리된 오류를 보고한다

- **WHEN** Native 앱이 처리된 오류 공통 진입점을 명시적으로 호출한다
- **THEN** HTTP 응답 이전의 Relay 전송 거절 제외 규칙과 관계없이 기존 처리된 오류 Sentry reporting을 수행한다

### Requirement: Native 오류 event에서 개인정보를 최소화한다

**Authority / Provenance:** PROD-483. 시스템은 Native Sentry event에 애플리케이션 사용자 식별자, 사용자 콘텐츠, 인증 정보 또는 그 밖의 민감정보를 추가해서는 안 되며(MUST NOT), SDK의 기본 PII 전송과 자동 breadcrumb 및 session tracking을 비활성화해야 한다(MUST). 배포 DSN·환경·release가 모두 없는 local 및 test 실행은 외부 event를 전송해서는 안 된다(MUST NOT).

#### Scenario: 애플리케이션 오류 수집

- **WHEN** 앱이 처리되지 않은 오류를 Sentry에 수집한다
- **THEN** event에는 앱이 추가한 사용자 식별자·사용자 콘텐츠·인증 정보가 없고 기본 PII·자동 breadcrumb·session tracking이 비활성화되어 있다

#### Scenario: Local 또는 test 실행

- **WHEN** 앱 실행에 배포 DSN, 환경 또는 release 중 하나라도 없다
- **THEN** Native Sentry SDK는 외부 event 전송을 활성화하지 않는다

### Requirement: Native release에 원본 오류 위치를 연결한다

**Authority / Provenance:** PROD-483. 시스템은 Android·iOS production build의 JavaScript source map과 native debug symbol을 해당 Sentry release에 업로드해야 하며(MUST), 업로드 자격 증명을 앱 bundle·repository·build artifact에 포함해서는 안 된다(MUST NOT).

#### Scenario: Android production release symbolication

- **WHEN** Android production build가 업로드 자격 증명을 사용해 JavaScript source map과 native debug symbol을 build release에 업로드한다
- **THEN** 해당 release의 Sentry event stack이 JavaScript 또는 native 원본 위치로 symbolicate된다

#### Scenario: iOS production release symbolication

- **WHEN** iOS production build가 업로드 자격 증명을 사용해 JavaScript source map과 native debug symbol을 build release에 업로드한다
- **THEN** 해당 release의 Sentry event stack이 JavaScript 또는 native 원본 위치로 symbolicate된다

#### Scenario: 업로드 자격 증명 보호

- **WHEN** Android·iOS production build가 완료된다
- **THEN** source map 및 debug symbol 업로드 token은 앱 bundle, repository와 배포 artifact에 남지 않는다
