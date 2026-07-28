## ADDED Requirements

### Requirement: 서버 처리되지 않은 오류 수집

**Authority / Provenance:** PROD-477, PROD-484. 프로덕션 API와 Web BFF는 처리되지 않은 서버 예외를 각각의 전역 오류 경계에서 Sentry로 수집해야 한다(MUST). API의 예상된 Kosmo 도메인 오류, 명시적으로 던진 `GraphQLError`와 BFF의 예상된 인증 오류는 event로 수집하지 않아야 하며(MUST NOT), GraphQL 변환 경계와 HTTP 전역 경계가 같은 예외를 중복 수집하지 않아야 한다(MUST).

#### Scenario: API unexpected GraphQL error

- **WHEN** API GraphQL 실행 중 예상하지 못한 예외가 발생한다
- **THEN** 시스템은 API runtime tag가 붙은 event를 한 번 수집하고 클라이언트에는 기존 `INTERNAL_SERVER_ERROR` 응답을 유지한다

#### Scenario: Web BFF unexpected error

- **WHEN** Web BFF route에서 예상하지 못한 예외가 전역 `onError` 경계에 도달한다
- **THEN** 시스템은 Web BFF runtime tag가 붙은 event를 한 번 수집하고 기존 500 응답을 유지한다

#### Scenario: Expected domain error

- **WHEN** Kosmo 도메인 오류 또는 예상된 OIDC 인증 오류가 기존 오류 처리 경계에 도달한다
- **THEN** 시스템은 오류를 기존 계약대로 응답하고 Sentry event를 생성하지 않는다

#### Scenario: Intentional GraphQL error

- **WHEN** resolver 또는 context가 `GraphQLError`를 명시적으로 던진다
- **THEN** 시스템은 기존 GraphQL message와 extensions를 유지하고 Sentry event를 생성하지 않는다
- **AND** plain `Error` 또는 non-null field 위반 같은 unexpected execution error만 `INTERNAL_SERVER_ERROR`로 변환해 수집한다

### Requirement: Web browser 처리되지 않은 오류 수집

**Authority / Provenance:** PROD-477, PROD-493. 프로덕션 Web 앱은 처리되지 않은 browser runtime 오류와 공용 React 오류 경계가 처리한 render 오류를 Sentry로 수집해야 한다(MUST). 공용 React 경계가 수집한 오류는 browser 전역 경계에서 다시 보고하지 않아야 하고(MUST), 사용자에게 보이는 기존 오류 화면·문구·재시도 동작을 바꾸지 않아야 한다(MUST NOT).

#### Scenario: React render error

- **WHEN** Web 앱의 공용 React 경계 아래에서 render 오류가 발생한다
- **THEN** 시스템은 Web runtime tag와 component stack을 가진 event를 한 번 수집하고 기존 오류 화면을 표시한다

#### Scenario: Nested boundary consumes a render error

- **WHEN** route 또는 session 오류 경계가 외부 공용 경계보다 먼저 Web render 오류를 처리한다
- **THEN** 내부 경계는 같은 Web reporter로 오류와 component stack을 수집하고 기존 fallback을 표시한다

#### Scenario: Browser runtime error

- **WHEN** 공용 React 경계 밖의 처리되지 않은 오류 또는 처리되지 않은 Promise rejection이 발생한다
- **THEN** 시스템은 Web runtime tag를 가진 event를 수집한다

#### Scenario: Native runtime exclusion

- **WHEN** 같은 공용 앱 source가 Android 또는 iOS에서 실행된다
- **THEN** 이 변경은 native Sentry SDK를 초기화하거나 native 오류·debug symbol을 업로드하지 않는다

### Requirement: SDK event 보존과 기본 telemetry 최소화

**Authority / Provenance:** 사용자 결정, PROD-477, PROD-484, PROD-493. Sentry SDK가 만든 event와 exception은 `beforeSend`에서 정제하거나 재구성하지 않고 그대로 전송해야 한다(MUST). SDK는 자동 breadcrumb, 기본 개인정보 전송과 Web 자동 session tracking을 활성화하지 않아야 한다(MUST NOT).

#### Scenario: Server request fails

- **WHEN** 인증 header, cookie, GraphQL body 또는 사용자 콘텐츠가 있는 요청에서 서버 예외가 발생한다
- **THEN** 수집된 event는 SDK가 만든 exception, request와 context를 유지하고 breadcrumb는 없다

#### Scenario: BFF authentication path has a server failure

- **WHEN** OIDC 또는 GraphQL proxy 설정·upstream 오류가 5xx `OidcAuthError`를 만든다
- **THEN** 기존 HTTP 오류 응답을 유지하면서 exception을 수집해야 한다
- **AND** 예상된 4xx 인증 거절은 수집하지 않아야 한다

#### Scenario: Browser interaction precedes failure

- **WHEN** 입력, 클릭, GraphQL 요청 또는 console 출력 뒤 Web 오류가 발생한다
- **THEN** 수집된 event에는 SDK가 만든 exception과 browser context가 유지되고 breadcrumb는 없다

### Requirement: 환경 runtime release 식별

**Authority / Provenance:** PROD-477, PROD-484, PROD-493. 수집되는 event는 배포 환경, `api`·`web-bff`·`web` runtime과 동일한 커밋 기반 release 식별자를 가져야 한다(MUST). 로컬 개발과 테스트는 기본적으로 외부 Sentry project에 event를 전송하지 않아야 한다(MUST NOT).

#### Scenario: Production event metadata

- **WHEN** 배포된 runtime이 event를 수집한다
- **THEN** event의 environment, runtime tag와 release가 현재 배포 커밋을 식별한다

#### Scenario: Local and test execution

- **WHEN** 애플리케이션이 production이 아닌 로컬 개발 또는 테스트 모드에서 실행된다
- **THEN** Sentry client는 외부 transport로 event를 전송하지 않는다

### Requirement: Source map 보안 업로드

**Authority / Provenance:** PROD-477, PROD-484, PROD-493. 배포 빌드는 API, Web BFF와 Web browser artifact의 source map을 생성하고 배포 전에 해당 Sentry release에 업로드해야 한다(MUST). 업로드 token은 build secret으로만 주입되어야 하며(MUST), 저장소·빌드 로그·client bundle·배포 image와 제공되는 Web asset에 포함되지 않아야 한다(MUST NOT). 제공되는 Web asset에서는 source map 파일과 참조를 제거해야 한다(MUST).

#### Scenario: Release artifact upload

- **WHEN** 인증된 프로덕션 배포 image를 빌드한다
- **THEN** 서버와 Web artifact가 동일 release에 업로드되고 업로드 완료 뒤 source map은 runtime image와 Web 정적 asset에서 제거된다

#### Scenario: Build without upload credentials

- **WHEN** 로컬 또는 검증 빌드에 source map 업로드 자격 증명이 없다
- **THEN** 빌드는 외부 업로드 없이 source map 생성과 정적 검증을 수행할 수 있고 secret 값을 요구하거나 출력하지 않는다

### Requirement: 운영 검증과 triage

**Authority / Provenance:** PROD-477, PROD-484, PROD-493. 저장소 문서는 설정 방법, event 전달 정책, 검증용 오류 절차, release·source map 확인과 새 오류를 담당 작업으로 넘기는 최소 triage 경로를 설명해야 한다(MUST). 배포 완료 판단은 API, Web BFF와 Web 각각의 검증 event에서 release와 원본 TypeScript·React 위치를 확인해야 한다(MUST).

#### Scenario: Deployment verification

- **WHEN** 운영자가 새 release를 배포한다
- **THEN** 문서화된 절차로 세 runtime의 검증 event, event 전달 결과, release 연결, 원본 위치와 알림 전달을 확인할 수 있다

#### Scenario: New issue triage

- **WHEN** Sentry에서 새로운 프로덕션 오류가 확인된다
- **THEN** 운영자는 문서화된 알림과 triage 기준에 따라 담당 Linear 작업으로 넘길 수 있다
