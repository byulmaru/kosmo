## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고 신규 행의 ID를 애플리케이션에서 표준 UUIDv7으로 생성해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** 주요 도메인 테이블의 신규 행이 생성된다
- **THEN** 시스템은 table discriminator가 없는 표준 UUIDv7 문자열을 기본 키로 생성한다
- **AND** ID는 PostgreSQL `uuid` column에 저장된다

#### Scenario: 기존 UUIDv8 행 유지

- **WHEN** 기존 table discriminator 포함 UUIDv8 primary key 또는 이를 참조하는 foreign key가 존재한다
- **THEN** 시스템은 해당 ID 값을 삭제, backfill 또는 재작성하지 않는다
- **AND** 기존 UUIDv8 row는 신규 UUIDv7 row와 같은 query, relation 및 loader 경로에서 계속 조회될 수 있다

#### Scenario: ID 전환 배포

- **WHEN** 신규 UUID 생성 규칙을 배포한다
- **THEN** 시스템은 PostgreSQL UUID column, primary key 또는 foreign key schema를 변경하지 않는다
- **AND** UUID version 통일을 위한 database migration을 실행하지 않는다

#### Scenario: 시간 기반 ID 동작

- **WHEN** 시스템이 같은 millisecond에 여러 UUIDv7 ID를 생성한다
- **THEN** 시스템은 ID 값만으로 생성 순서가 단조 증가한다고 보장하지 않는다
- **AND** 저장 시각 순서가 필요한 query는 immutable timestamp와 ID tie-breaker를 사용한다
