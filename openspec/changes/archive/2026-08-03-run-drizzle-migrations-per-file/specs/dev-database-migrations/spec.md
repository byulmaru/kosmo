## MODIFIED Requirements

### Requirement: Runtime migration command

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Dev에 배포되는 runtime image는 애플리케이션 server 시작과 분리된 명시적 migration command로 image에 포함된 Drizzle SQL migration을 대상 PostgreSQL에 적용해야 한다(MUST). Command는 version control 순서의 각 migration 파일을 독립 transaction으로 실행하고(MUST), 한 파일의 모든 SQL statement와 해당 Drizzle history insert를 같은 transaction에서 함께 commit하거나 rollback해야 한다(MUST). 성공한 앞 파일을 이후 파일의 실패 때문에 rollback해서는 안 되며(MUST NOT), 재실행은 history에 기록된 마지막 성공 파일 다음부터 계속해야 한다(MUST).

#### Scenario: Pending migration 적용

- **WHEN** runtime migration command가 여러 미적용 migration이 있는 dev database를 대상으로 실행된다
- **THEN** 시스템은 migration을 version control 순서대로 파일마다 독립 transaction에서 적용한다
- **AND** 각 파일의 SQL과 history insert를 같은 transaction에서 commit한다
- **AND** 시스템은 기존 domain data를 reset하거나 schema 전체를 재생성하지 않는다

#### Scenario: Enum 추가 다음 파일에서 사용

- **WHEN** 한 pending migration이 기존 PostgreSQL enum에 값을 추가하고 바로 다음 pending migration이 그 값을 사용한다
- **THEN** enum 추가 migration의 SQL과 history를 먼저 commit한다
- **AND** 다음 migration은 별도 transaction에서 commit된 enum 값을 사용할 수 있다

#### Scenario: Pending migration 없는 실행

- **WHEN** runtime migration command가 모든 migration이 적용된 dev database를 대상으로 실행된다
- **THEN** 시스템은 domain schema, data와 migration history를 변경하지 않고 성공한다

#### Scenario: 중간 migration 실패

- **WHEN** 여러 pending migration 중 한 migration 파일의 SQL이 실패한다
- **THEN** migration command는 실패 exit status를 반환한다
- **AND** 실패한 파일의 schema·data 변경과 history insert를 모두 rollback한다
- **AND** 앞에서 성공한 파일의 schema 변경과 history는 함께 남는다
- **AND** 아직 실행하지 않은 뒤 파일은 적용하지 않는다

#### Scenario: 실패 후 재실행

- **WHEN** 중간 migration 실패 원인을 제거하고 같은 migration command를 다시 실행한다
- **THEN** 시스템은 이미 history에 기록된 성공 파일을 다시 실행하지 않는다
- **AND** 이전에 실패한 파일부터 version control 순서로 적용을 계속한다

## ADDED Requirements

### Requirement: Drizzle migration history 호환성과 무결성

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Runtime migration command는 version-controlled Drizzle migration directory의 파일 순서, statement breakpoint, name, timestamp와 hash 및 기존 `drizzle.__drizzle_migrations` history를 호환되게 사용해야 한다(MUST). 실행 전에 적용된 history가 로컬 migration 순서의 유효한 prefix이며 적용된 migration의 hash가 일치하는지 검증해야 하고(MUST), 적용된 migration의 누락, 순서 변경 또는 hash 변경을 발견하면 새 SQL을 실행해서는 안 된다(MUST NOT).

#### Scenario: 기존 Drizzle history에서 계속 실행

- **WHEN** database에 기존 Drizzle runner가 기록한 유효한 migration history와 그 뒤의 새 pending 파일이 있다
- **THEN** runtime migration command는 기존 history를 그대로 인식한다
- **AND** 별도 history table이나 수동 변환 없이 새 pending 파일만 실행한다

#### Scenario: 적용된 migration hash 변경

- **WHEN** database history에 기록된 적용 migration과 같은 위치의 로컬 migration hash가 다르다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** database history를 현재 로컬 hash로 덮어쓰지 않는다

#### Scenario: 적용 순서가 유효한 prefix가 아님

- **WHEN** database history에 있는 migration이 로컬 version control 순서에서 누락되거나 중간 migration을 건너뛴 상태다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** 누락된 history를 자동 성공 처리하거나 순서를 재작성하지 않는다
