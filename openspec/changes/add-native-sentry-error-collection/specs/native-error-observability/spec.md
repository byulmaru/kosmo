## ADDED Requirements

### Requirement: Android·iOS의 처리되지 않은 오류를 수집한다

**Authority / Provenance:** PROD-477, PROD-483. 시스템은 production Android·iOS 앱의 처리되지 않은 React 및 native runtime 오류를 기존 오류 UI 동작을 바꾸지 않고 Sentry에 수집해야 한다(MUST). 각 event는 실행 환경과 배포 release를 식별할 수 있어야 한다(MUST).

#### Scenario: 처리되지 않은 React 오류

- **WHEN** production Android 또는 iOS 앱의 React 오류 경계가 처리되지 않은 오류를 소비한다
- **THEN** 시스템은 기존 fallback과 재시도 동작을 유지하며 오류를 해당 환경과 release의 Sentry event로 수집한다

#### Scenario: Native runtime 오류

- **WHEN** production Android 또는 iOS runtime에서 처리되지 않은 오류가 발생한다
- **THEN** 시스템은 해당 platform, 환경과 release를 식별할 수 있는 Sentry event를 수집한다

### Requirement: Native 오류 event에서 개인정보를 최소화한다

**Authority / Provenance:** PROD-483. 시스템은 Native Sentry event에 애플리케이션 사용자 식별자, 사용자 콘텐츠, 인증 정보 또는 그 밖의 민감정보를 추가해서는 안 되며(MUST NOT), SDK의 기본 PII 전송과 자동 breadcrumb 및 session tracking을 비활성화해야 한다(MUST). 배포 DSN·환경·release가 모두 없는 local 및 test 실행은 외부 event를 전송해서는 안 된다(MUST NOT).

#### Scenario: 애플리케이션 오류 수집

- **WHEN** 앱이 처리되지 않은 오류를 Sentry에 수집한다
- **THEN** event에는 앱이 추가한 사용자 식별자·사용자 콘텐츠·인증 정보가 없고 기본 PII·자동 breadcrumb·session tracking이 비활성화되어 있다

#### Scenario: Local 또는 test 실행

- **WHEN** 앱 실행에 배포 DSN, 환경 또는 release 중 하나라도 없다
- **THEN** Native Sentry SDK는 외부 event 전송을 활성화하지 않는다

### Requirement: Native release의 원본 오류 위치를 확인한다

**Authority / Provenance:** PROD-483. 시스템은 Android·iOS production build의 JavaScript source map과 native debug symbol을 해당 Sentry release에 업로드해야 하며(MUST), 업로드 자격 증명을 앱 bundle·repository·build artifact에 포함해서는 안 된다(MUST NOT).

#### Scenario: Android production 검증 오류

- **WHEN** 업로드 자격 증명이 있는 Android production build에서 검증 오류를 발생시킨다
- **THEN** Sentry에서 build release와 JavaScript 또는 native 원본 위치를 확인할 수 있다

#### Scenario: iOS production 검증 오류

- **WHEN** 업로드 자격 증명이 있는 iOS production build에서 검증 오류를 발생시킨다
- **THEN** Sentry에서 build release와 JavaScript 또는 native 원본 위치를 확인할 수 있다

#### Scenario: 업로드 자격 증명 보호

- **WHEN** Android·iOS production build가 완료된다
- **THEN** source map 및 debug symbol 업로드 token은 앱 bundle, repository와 배포 artifact에 남지 않는다
