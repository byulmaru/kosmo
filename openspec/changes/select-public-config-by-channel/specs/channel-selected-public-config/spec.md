## ADDED Requirements

### Requirement: 공용값과 채널값으로 공개 설정을 완성한다

**Authority / Provenance:** [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다) 클라이언트는 두 채널에서 함께 변경되는 공개값을 한 번만 선언하고 `dev`와 `prod`별 값을 합성해 각 채널의 완전한 공개 설정을 만들어야 한다(MUST). 각 완성 설정은 API origin, Web origin, OIDC issuer, Native OIDC client ID와 browser observability/analytics의 채널별 활성 여부를 제공해야 한다(MUST).

#### Scenario: 공용값을 두 채널에서 사용한다

- **WHEN** 클라이언트가 `dev` 또는 `prod` 공개 설정을 선택한다
- **THEN** 두 설정은 한 번만 선언된 공용값을 사용한다
- **AND** 각 채널에서 필요한 모든 공개 설정 필드가 존재한다

#### Scenario: 채널별 origin을 선택한다

- **WHEN** 클라이언트가 `dev`와 `prod` 설정을 각각 선택한다
- **THEN** 각 설정은 해당 채널의 API origin과 Web origin을 제공한다

#### Scenario: Development analytics는 비활성화한다

- **WHEN** 클라이언트가 `dev` 공개 설정을 선택한다
- **THEN** PostHog client를 초기화하지 않는다
- **WHEN** 클라이언트가 `prod` 공개 설정을 선택한다
- **THEN** `prod` 채널에 속한 PostHog 설정을 사용한다

### Requirement: 플랫폼 경계에서 배포 채널만 선택한다

**Authority / Provenance:** [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다) Web BFF는 `dev` 또는 `prod` 중 하나인 배포 채널만 same-origin script로 제공해야 하며(MUST), 응답을 cache해서는 안 된다(MUST NOT). Web client는 Expo bundle 실행 전에 이 채널을 읽어야 하고(MUST), 누락되거나 알 수 없는 값에 다른 채널을 기본 적용해서는 안 된다(MUST NOT). Native local development는 `dev`, Native release binary는 `prod`를 선택해야 한다(MUST).

#### Scenario: Web BFF가 유효한 채널을 제공한다

- **WHEN** 브라우저가 Web BFF의 channel script를 요청한다
- **THEN** BFF는 현재 배포의 `dev` 또는 `prod` 채널을 제공한다
- **AND** 응답에 `no-store` cache 정책을 적용한다

#### Scenario: Web channel이 유효하지 않다

- **WHEN** Web bundle 시작 시 주입된 channel이 없거나 `dev`와 `prod`가 아니다
- **THEN** 클라이언트는 공개 설정 선택을 실패한다
- **AND** 다른 채널로 fallback하지 않는다

#### Scenario: Native가 build mode에 맞는 채널을 선택한다

- **WHEN** Native client가 local development mode에서 실행된다
- **THEN** 클라이언트는 `dev` 공개 설정을 선택한다
- **WHEN** Android 또는 iOS release binary가 실행된다
- **THEN** 클라이언트는 `prod` 공개 설정을 선택한다

### Requirement: 공개 설정과 배포 비밀·메타데이터를 분리한다

**Authority / Provenance:** [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다) 클라이언트는 채널 공개 설정값을 `EXPO_PUBLIC_*` 환경변수, GitHub Variables 또는 전용 Vault object에서 읽어서는 안 된다(MUST NOT). Sentry release, Git SHA, app version/build number는 build metadata 경계에 유지해야 하며(MUST), credential과 signing material은 공개 설정표에 포함해서는 안 된다(MUST NOT).

#### Scenario: 클라이언트 bundle을 생성한다

- **WHEN** Web, Android 또는 iOS client bundle을 생성한다
- **THEN** 공개 설정값은 코드의 선택된 채널 설정에서 제공된다
- **AND** build workflow는 공개 설정값을 Vault 또는 GitHub Variables에서 주입하지 않는다

#### Scenario: 비밀값과 release metadata를 사용한다

- **WHEN** build 또는 server runtime이 credential이나 release metadata를 사용한다
- **THEN** 해당 값은 공개 설정표 밖의 기존 보안 또는 build metadata 경계에서 제공된다
