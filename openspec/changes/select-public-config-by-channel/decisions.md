## Context

이 기록은 PROD-891에서 승인한 공개 설정 source, Web channel 주입과 Native channel 선택 경계를 구현 전에 고정한다.

## Decision Records

### 공개 설정은 공용값과 완성된 채널 설정으로 관리한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)
- Status: Active
- Context / Problem: 공개 client 값이 GitHub Variables와 Vault 전달 경로에 분산됐고, 두 채널이 공유하는 값도 중복 관리됐다.
- Decision Outcome: 코드에서 공용값을 한 번 선언하고 이를 포함한 완전한 `dev`와 `prod` 설정을 정적으로 검사한다.
- Alternatives Considered: 채널별 전체 객체 중복, runtime 재귀 병합, Vault 전용 공개 object. 중복 또는 전달 계층을 유지하므로 선택하지 않았다.
- Consequences: 공개값 변경은 코드 review와 client release가 필요하지만 source와 변경 이력이 한곳에 남는다.
- Confirmation / Follow-up: 두 채널의 타입 완전성과 공용값 재사용을 단위 테스트와 TypeScript로 확인한다.

### Web은 BFF channel만 받고 Native는 build mode로 선택한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)
- Status: Active
- Context / Problem: Web은 runtime 배포 채널을 알아야 하지만 공개 설정 전체를 주입하면 다시 별도 config API와 검증 계층이 생긴다. Native release는 설치 후 환경을 전환하지 않는다.
- Decision Outcome: BFF는 allowlist로 검증한 `dev` 또는 `prod` one-line script를 제공하고, 성공 응답은 `Cache-Control: public, max-age=300`으로 5분 캐시한다. `ENVIRONMENT`가 invalid/missing이면 500과 `Cache-Control: no-store`를 반환한다. Web은 bundle 전에 이를 읽고 invalid/missing 값에 fail closed하며, Native는 local development에서 `dev`, release에서 `prod`를 선택한다.
- Alternatives Considered: 전체 runtime JSON, HTML/압축 JS 치환, Native runtime config, preview/OTA 채널. 현재 범위보다 복잡하거나 정적 asset 일관성을 해치므로 선택하지 않았다.
- Consequences: Web image는 공개 설정 주입 없이 채널로 동작하고 Native endpoint 변경은 새 release binary가 필요하다.
- Confirmation / Follow-up: BFF route와 channel validation을 자동화하고 실제 Web·Native 배포 증거는 각 release gate에서 확인한다.

### 비밀값과 release metadata는 공개 설정에서 분리한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)
- Status: Active
- Context / Problem: client에 공개되는 설정과 server credential 또는 commit별 metadata는 수명과 보안 경계가 다르다.
- Decision Outcome: Sentry release, Git SHA와 build number는 build metadata로 유지하고 auth token, client secret, database/signing credential은 Vault에 유지한다.
- Alternatives Considered: 모든 값을 채널 설정표에 포함. credential 노출과 release identity 고정이 발생하므로 선택하지 않았다.
- Consequences: workflow에는 설정값이 아닌 build metadata와 secret 전달만 남는다.
- Confirmation / Follow-up: client 설정표와 build arguments에 credential이 포함되지 않는지 검토한다.

### Web과 Native는 하나의 confidential OIDC application을 공유한다

- Decision Date: 2026-09-04
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)
- Status: Active
- Context / Problem: 기존 Web confidential application과 Native public application 분리는 동일한 사용자 인증 결과를 서로 다른 client audience와 token exchange 정책으로 운영하게 만들고, Native code exchange에서 server-side confidential 경계를 약화시켰다.
- Decision Outcome: Web과 Native는 하나의 Kosmo confidential OIDC application client ID를 사용한다. Native는 system browser에서 PKCE authorization과 `kosmo://login/callback` callback만 수행하고 client secret을 보유하거나 전송하지 않는다. API는 server-held client secret과 같은 client ID로 Native authorization code, PKCE verifier와 exact redirect URI를 OIDC token endpoint에 제출한다. Web은 같은 client ID와 server-held secret으로 현재 origin의 `/login/callback`을 유지한다.
- Alternatives Considered: Web과 Native의 별도 OIDC application 유지, Native public client 방식의 secret 없는 token exchange, Native 요청을 Web BFF에서 교환. 각각 shared audience 계약을 만들지 못하거나 confidential secret 경계를 약화시키거나 Native transport 경계를 침해하므로 선택하지 않았다.
- Consequences: Web BFF와 API의 OIDC configuration은 같은 application ID와 secret을 가리켜야 하고 Web·Native redirect URI와 PKCE 검증을 함께 배포·검증해야 한다. Native bundle에는 client ID만 공개되며 secret은 server-side configuration에 남는다.
- Confirmation / Follow-up: Web login/callback, Native authorize/callback/API exchange, audience·signature 검증, SecureStore session binding과 secret 비노출을 실제 배포 경계에서 확인한다. Native 전용 application은 migration과 rollback 증거가 확보될 때까지 병행 유지하고, 이전 release binary와 이전 client 사용이 더 이상 필요 없다는 별도 cleanup gate 이후에만 제거한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
