## ADDED Requirements

### Requirement: 실행별 테스트 데이터베이스 격리

테스트 DB 도구는 하나의 Postgres 서버를 공유하면서 각 테스트 실행에 고유한 `kosmo_test_` 접두사 데이터베이스를 생성하여 사용해야 한다(SHALL).

#### Scenario: 두 테스트 실행이 동시에 시작됨

- **WHEN** 서로 다른 실행 식별자를 가진 두 테스트가 동시에 시작된다
- **THEN** 각 실행은 서로 다른 데이터베이스를 생성하고 상대 실행의 schema, fixture, reset 결과에 영향을 주지 않는다

### Requirement: 명시적인 테스트 데이터베이스 URL 전달

테스트 명령은 호출자가 제공한 `DATABASE_URL`을 기본 테스트 URL보다 우선하고 schema push, Fedify 테스트, Playwright 설정 및 애플리케이션 서버에 동일한 URL을 전달해야 한다(SHALL).

#### Scenario: 실행별 DATABASE_URL이 제공됨

- **WHEN** 테스트 실행이 고유 데이터베이스를 가리키는 `DATABASE_URL`을 제공한다
- **THEN** 테스트 DB 도구와 모든 DB 사용 테스트 프로세스는 해당 URL만 사용한다

#### Scenario: DATABASE_URL이 제공되지 않음

- **WHEN** 개발자가 별도 환경변수 없이 로컬 테스트 명령을 실행한다
- **THEN** 테스트 DB 도구는 충돌 가능성이 낮은 실행별 데이터베이스 이름을 생성하고 그 URL로 테스트를 실행한다

### Requirement: 실행 소유 데이터베이스 정리

테스트 실행은 성공 또는 실패 여부와 관계없이 자신이 생성한 데이터베이스의 연결을 종료하고 해당 데이터베이스만 삭제해야 한다(SHALL).

#### Scenario: 테스트가 성공함

- **WHEN** 테스트 명령이 성공적으로 끝난다
- **THEN** 실행이 생성한 데이터베이스가 삭제되고 공유 Postgres 서버는 계속 실행된다

#### Scenario: 테스트가 실패함

- **WHEN** schema push, Fedify 또는 Playwright 테스트가 실패한다
- **THEN** 종료 처리에서 실행이 생성한 데이터베이스가 삭제되고 원래 실패 상태가 보존된다

### Requirement: 파괴적 DB 작업 안전장치

테스트 DB 도구와 fixture는 reset, truncate 또는 drop 전에 대상이 허용된 로컬 테스트 서버의 `kosmo_test` 또는 `kosmo_test_*` 네임스페이스 데이터베이스인지 검증해야 한다(MUST).

#### Scenario: 테스트 데이터베이스가 아닌 URL이 제공됨

- **WHEN** 대상 호스트 또는 데이터베이스 이름이 테스트 안전 조건을 만족하지 않는다
- **THEN** 파괴적 작업을 실행하지 않고 명확한 오류로 실패한다

### Requirement: CI 병렬 실행 허용

Web E2E workflow는 실행별 데이터베이스와 로컬 서버 포트 격리를 사용하고 서로 다른 workflow run을 저장소 전역 잠금으로 직렬화하지 않아야 한다(SHALL).

#### Scenario: 여러 workflow run이 대기 중임

- **WHEN** 둘 이상의 self-hosted runner 슬롯이 사용 가능하다
- **THEN** workflow run은 각자 고유 데이터베이스와 API, web, OIDC mock 포트를 사용해 동시에 테스트 단계를 실행할 수 있다

### Requirement: 실행별 Web E2E origin 일관성

테스트 DB wrapper는 실행별 포트 offset을 자식 명령에 전달하고 Playwright는 해당 offset으로 API, web, OIDC mock origin을 일관되게 구성해야 한다(SHALL).

#### Scenario: 두 Web E2E 실행이 동시에 시작됨

- **WHEN** 서로 다른 실행 식별자를 가진 두 Web E2E 테스트가 같은 머신에서 동시에 시작된다
- **THEN** 두 실행의 로컬 서버는 서로 다른 포트에 bind하고 각 테스트 fixture와 OIDC 요청은 자기 실행의 origin을 사용한다
