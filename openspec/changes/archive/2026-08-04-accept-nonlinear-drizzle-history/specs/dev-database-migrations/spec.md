## MODIFIED Requirements

### Requirement: Runtime migration command

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Dev에 배포되는 runtime image는 애플리케이션 server 시작과 분리된 명시적 migration command로 image에 포함된 Drizzle SQL migration을 대상 PostgreSQL에 적용해야 한다(MUST). Command는 이미 적용된 migration name을 제외한 미적용 파일을 version control 순서로 선택하고 각 파일을 독립 transaction으로 실행해야 하며(MUST), 한 파일의 모든 SQL statement와 해당 Drizzle history insert를 같은 transaction에서 함께 commit하거나 rollback해야 한다(MUST). 성공한 앞 파일을 이후 파일의 실패 때문에 rollback해서는 안 되며(MUST NOT), 재실행은 history의 적용된 name/hash 집합을 건너뛰고 아직 적용되지 않은 파일만 계속해야 한다(MUST).

#### Scenario: Pending migration 적용

- **WHEN** runtime migration command가 여러 미적용 migration이 있는 dev database를 대상으로 실행된다
- **THEN** 시스템은 history에 없는 migration을 version control 순서대로 파일마다 독립 transaction에서 적용한다
- **AND** 각 파일의 SQL과 history insert를 같은 transaction에서 commit한다
- **AND** 시스템은 기존 domain data를 reset하거나 schema 전체를 재생성하지 않는다

#### Scenario: Enum 추가 다음 파일에서 사용

- **WHEN** 한 pending migration이 기존 PostgreSQL enum에 값을 추가하고 바로 다음 pending migration이 그 값을 사용한다
- **THEN** enum 추가 migration의 SQL과 history를 먼저 commit한다
- **AND** 다음 migration은 별도 transaction에서 commit된 enum 값을 사용할 수 있다

#### Scenario: Pending migration 없는 실행

- **WHEN** runtime migration command가 모든 migration name과 같은 hash가 적용된 dev database를 대상으로 실행된다
- **THEN** 시스템은 domain schema, data와 migration history를 변경하지 않고 성공한다

#### Scenario: 중간 migration 실패

- **WHEN** 여러 pending migration 중 한 migration 파일의 SQL이 실패한다
- **THEN** migration command는 실패 exit status를 반환한다
- **AND** 실패한 파일의 schema·data 변경과 history insert를 모두 rollback한다
- **AND** 앞에서 성공한 파일의 schema 변경과 history는 함께 남는다
- **AND** 아직 실행하지 않은 뒤 파일은 적용하지 않는다

#### Scenario: 실패 후 재실행

- **WHEN** 중간 migration 실패 원인을 제거하고 같은 migration command를 다시 실행한다
- **THEN** 시스템은 이미 history에 같은 name/hash로 기록된 성공 파일을 다시 실행하지 않는다
- **AND** 아직 적용되지 않은 파일을 version control 순서로 적용한다

### Requirement: Drizzle migration history 호환성과 무결성

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Runtime migration command는 version-controlled Drizzle migration directory의 파일 순서, statement breakpoint, name, timestamp와 hash 및 기존 `drizzle.__drizzle_migrations` history를 호환되게 사용해야 한다(MUST). 실행 전에 적용된 각 history name이 로컬 migration에 존재하고 같은 hash를 가지는지 검증해야 하며(MUST), DB row의 적용 순서가 로컬 timestamp 정렬과 다르다는 이유만으로 정상 history를 거부해서는 안 된다(MUST NOT). 로컬에 없는 history, 같은 name의 hash 변경, 중복 name/history를 발견하면 새 SQL을 실행해서는 안 된다(MUST NOT).

#### Scenario: 기존 Drizzle history에서 계속 실행

- **WHEN** database에 기존 Drizzle runner가 기록한 유효한 migration history와 새 pending 파일이 있다
- **THEN** runtime migration command는 기존 history의 각 name/hash를 그대로 인식한다
- **AND** 별도 history table이나 수동 변환 없이 아직 적용되지 않은 파일만 실행한다

#### Scenario: 비선형 적용 순서

- **WHEN** 병렬 브랜치 merge·배포 때문에 database history의 row 순서가 로컬 migration timestamp 정렬과 다르지만 모든 적용 name이 로컬에 존재하고 hash가 일치한다
- **THEN** runtime migration command는 history를 유효하게 인식한다
- **AND** history row를 재정렬하거나 다시 기록하지 않는다
- **AND** 아직 적용되지 않은 migration만 version control 순서로 실행한다

#### Scenario: 적용된 migration hash 변경

- **WHEN** database history에 기록된 migration name과 같은 로컬 migration의 hash가 다르다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** database history를 현재 로컬 hash로 덮어쓰지 않는다

#### Scenario: 알 수 없거나 중복된 history

- **WHEN** database history에 로컬에 없는 migration name이나 중복 name이 있다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** 누락된 파일을 자동 성공 처리하거나 history를 재작성하지 않는다

#### Scenario: Legacy history 승격

- **WHEN** 기존 Drizzle history에 name이 없고 hash와 timestamp만 기록돼 있다
- **THEN** runtime migration command는 row 위치가 아니라 기존 Drizzle과 호환되는 timestamp/hash 대응으로 로컬 migration name을 식별한다
- **AND** 대응하지 않는 row가 있으면 history를 변경하거나 새 SQL을 실행하기 전에 실패한다
