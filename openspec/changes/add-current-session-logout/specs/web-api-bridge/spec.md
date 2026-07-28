## ADDED Requirements

### Requirement: Same-origin Web logout BFF

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-474` Web BFF는 HttpOnly `kosmo_session` cookie의 현재 Session 로그아웃을 처리하는 `POST /logout` endpoint를 제공해야 한다(MUST). endpoint는 요청 Origin이 구성된 public origin과 정확히 일치할 때만 cookie credential을 사용해야 하고(MUST), GraphQL mutation과 같은 transport-neutral revoke core 계약을 사용해야 한다(MUST).

#### Scenario: Same-origin Web 로그아웃

- **WHEN** 구성된 public origin의 browser가 `kosmo_session` cookie와 같은 Origin header로 `POST /logout`을 요청한다
- **THEN** BFF는 cookie credential이 식별한 current-session revoke 결과를 확정한다
- **AND** 폐기 또는 이미 인증 불가능한 상태가 확정되면 `204 No Content`를 반환한다
- **AND** response를 cache할 수 없게 한다

#### Scenario: 다른 Origin의 요청 거부

- **WHEN** `POST /logout`의 Origin header가 없거나 구성된 public origin과 다르다
- **THEN** BFF는 current-session revoke를 실행하지 않는다
- **AND** Session cookie를 제거하지 않고 forbidden response를 반환한다

#### Scenario: 지원하지 않는 method 거부

- **WHEN** client가 `/logout`에 POST 이외의 method를 사용한다
- **THEN** BFF는 current-session revoke를 실행하지 않는다
- **AND** `Allow: POST`를 포함한 method not allowed response를 반환한다

#### Scenario: 결과 불명 실패

- **WHEN** BFF가 Session의 최종 상태를 확정할 수 없는 database 또는 server 실패를 만난다
- **THEN** BFF는 성공 response를 반환하지 않는다
- **AND** 기존 Session cookie를 제거하지 않는다

### Requirement: Web Session cookie 제거

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-474` Web BFF는 current-session revoke 또는 이미 인증 불가능한 상태가 확정된 response에서만 HttpOnly `kosmo_session` cookie를 제거해야 한다(MUST). 제거 response는 로그인 시 사용한 `Path=/`, SameSite와 HTTPS Secure 정책에 맞는 cookie scope를 사용해야 한다(MUST).

#### Scenario: 폐기 확정 뒤 cookie 제거

- **WHEN** BFF가 cookie credential의 현재 Session을 Revoked로 전이했음을 확정한다
- **THEN** response는 `kosmo_session`을 즉시 만료한다
- **AND** browser script가 cookie 값을 읽거나 직접 제거하지 않는다

#### Scenario: 이미 인증 불가능한 cookie 제거

- **WHEN** cookie가 없거나 credential이 Deleted Account 또는 Revoked/Expired Session을 가리켜 이미 인증 불가능함이 확정된다
- **THEN** BFF는 로그아웃 완료 response와 함께 `kosmo_session` cookie를 즉시 만료한다

#### Scenario: 불명확한 실패에서 cookie 유지

- **WHEN** BFF가 revoke 결과를 확정하지 못한다
- **THEN** response는 `kosmo_session` cookie를 만료하지 않는다
- **AND** browser는 같은 credential로 로그아웃을 재시도할 수 있다
