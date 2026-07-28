## ADDED Requirements

### Requirement: Runtime별 current-session logout 호출

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475` 공용 Expo client는 사용자가 로그아웃을 요청하면 Web에서는 same-origin logout BFF를, Android/iOS에서는 `revokeCurrentSession` GraphQL mutation을 호출해야 한다(MUST). 두 runtime 모두 서버가 폐기 또는 이미 인증 불가능한 상태를 확정하기 전에는 local logout 완료로 전환해서는 안 된다(MUST NOT).

#### Scenario: Web runtime 로그아웃 호출

- **WHEN** Web 사용자가 공용 logout action을 실행한다
- **THEN** client는 현재 origin의 `POST /logout`을 credential을 포함해 호출한다
- **AND** browser script는 HttpOnly cookie 값을 읽거나 조작하지 않는다

#### Scenario: Native runtime 로그아웃 호출

- **WHEN** Android 또는 iOS 사용자가 공용 logout action을 실행한다
- **THEN** client는 SecureStore에서 복원한 bearer credential로 공개 API의 `revokeCurrentSession` mutation을 호출한다
- **AND** 임의 Session ID를 mutation input으로 전달하지 않는다

#### Scenario: 이미 인증 불가능한 결과

- **WHEN** runtime별 server 경계가 credential이 이미 인증 불가능한 확정 결과를 반환한다
- **THEN** client는 정상 폐기와 같은 로그아웃 완료 경로를 실행한다

### Requirement: 확정된 로그아웃의 credential과 Relay 상태 정리

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475` client는 server 결과가 확정된 뒤에만 caller-owned credential과 viewer 종속 Relay Environment/Store를 제거해야 한다(MUST). 로그아웃한 viewer의 normalized cache를 다음 인증 또는 guest 상태에 재사용해서는 안 되며(MUST NOT), 정리 뒤 root onboarding route로 replace 이동해야 한다(MUST).

#### Scenario: Web 로그아웃 정리

- **WHEN** Web logout BFF가 성공 response를 반환하고 HttpOnly cookie 제거를 확정한다
- **THEN** client는 viewer 종속 Relay Environment/Store를 새 guest 환경으로 교체한다
- **AND** route history를 쌓지 않고 `/`로 replace 이동한다

#### Scenario: Native 로그아웃 정리

- **WHEN** Native GraphQL mutation이 로그아웃 완료 payload를 반환한다
- **THEN** client는 기존 SecureStore 경계로 session token을 제거한다
- **AND** viewer 종속 Relay Environment/Store를 새 guest 환경으로 교체한다
- **AND** `/`로 replace 이동한다

#### Scenario: 다음 인증에서 이전 viewer cache 격리

- **WHEN** 사용자가 로그아웃 뒤 guest 상태를 사용하거나 다른 Session으로 로그인한다
- **THEN** 이전 Session의 viewer-relative Relay record를 표시하지 않는다
- **AND** 새 actor 상태의 query는 새 Environment/Store에서 실행한다

### Requirement: 로그아웃 실패와 중복 실행 처리

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475` client는 결과 불명 실패를 로그아웃 성공으로 표시해서는 안 되며(MUST NOT), credential과 기존 viewer 상태를 유지한 채 재시도를 제공해야 한다(MUST). 로그아웃 요청이 진행되는 동안 같은 action의 중복 실행을 방지해야 한다(MUST).

#### Scenario: 결과 불명 실패 유지

- **WHEN** runtime별 logout 요청이 network 오류, 응답 유실 또는 server error로 실패한다
- **THEN** client는 local credential과 기존 Relay actor 상태를 유지한다
- **AND** 비인증 화면으로 이동하지 않는다
- **AND** 사용자가 로그아웃을 재시도할 수 있다

#### Scenario: 진행 중 중복 실행

- **WHEN** logout 요청이 진행되는 동안 사용자가 logout control을 다시 활성화한다
- **THEN** client는 두 번째 server 요청을 시작하지 않는다
- **AND** 하나의 진행 상태만 유지한다

#### Scenario: 재시도 성공

- **WHEN** 결과 불명 실패 뒤 사용자가 로그아웃을 다시 요청하고 server 결과가 확정된다
- **THEN** client는 credential과 Relay 상태 정리를 한 번 완료한다
- **AND** `/`로 replace 이동한다
