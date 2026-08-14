## MODIFIED Requirements

### Requirement: 단순한 migration 실행기

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-564`, `PROD-656`. Production migration Job은 release image의 `migrate` command만 실행해야 하며(MUST), 이 command는 version-controlled Drizzle migration 형식과 기존 history를 유지하면서 각 pending migration 파일의 SQL과 history insert를 독립 transaction으로 적용해야 한다(MUST). Generic phase selector, schema authority input, database target input, restore-point command 또는 backup/compatibility collector를 포함해서는 안 된다(MUST NOT).

#### Scenario: Production migration 실행

- **WHEN** production migration Job이 렌더된다
- **THEN** container argument는 `migrate`이다
- **AND** runner는 기존 Drizzle migration directory, history와 advisory lock을 사용한다
- **AND** 각 pending migration 파일의 SQL과 history insert를 같은 독립 transaction에서 적용한다

#### Scenario: Production enum 연속 migration

- **WHEN** 승인된 release에 기존 enum 값을 추가하는 migration과 그 값을 사용하는 다음 migration이 함께 pending이다
- **THEN** runner는 enum 추가 파일을 history와 함께 commit한 뒤 다음 파일을 별도 transaction으로 실행한다
- **AND** migration SQL 내부의 수동 `COMMIT; BEGIN;`이나 enum별 preflight를 요구하지 않는다

#### Scenario: Destructive migration 조건

- **WHEN** 실제 schema change가 contract migration을 포함한다
- **THEN** 해당 migration 이슈·PR·release가 backup/restore evidence, 구버전 workload compatibility와 rollback window를 구체적으로 정의하고 검증한다
- **AND** generic production migration Job은 이를 JSON metadata나 command mode로 추상화하지 않는다

### Requirement: Production release 단일 승인과 실패 차단

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-563`, `PROD-564`, `PROD-656`. 정식 production release 승인은 선택한 immutable image의 migration과 모든 활성화 workload 전체에 한 번 적용되어야 한다(MUST). Migration이 성공하기 전에 같은 release의 새 workload를 활성화해서는 안 되며(MUST NOT), 중간 파일 실패 시 성공한 앞 migration의 schema와 history는 함께 유지하고 실패한 파일의 schema와 history는 함께 rollback해야 한다(MUST).

#### Scenario: Migration 성공

- **WHEN** 승인된 production release의 모든 pending migration 파일이 성공한다
- **THEN** PROD-563 pipeline은 같은 immutable release의 모든 wave 2 workload 활성화를 진행할 수 있다

#### Scenario: Migration 중간 파일 실패

- **WHEN** credential, SQL, advisory lock 또는 timeout으로 production migration Job이 실패한다
- **THEN** 같은 release의 새 workload 활성화는 실행되지 않는다
- **AND** 실패한 migration 파일의 schema·data 변경과 history insert는 함께 남지 않는다
- **AND** 앞에서 성공한 migration 파일의 schema 변경과 history는 함께 남는다
- **AND** database rollback을 자동 실행하거나 실패한 migration을 적용 완료로 기록하지 않는다

#### Scenario: 실패한 release의 재실행

- **WHEN** 실패 원인을 수정한 새 승인 release가 같은 database에서 migration command를 실행한다
- **THEN** runner는 앞서 성공해 history에 기록된 파일을 다시 실행하지 않는다
- **AND** 이전에 실패한 파일부터 적용을 계속한다

#### Scenario: 중복 승인 금지

- **WHEN** production release가 승인됐다
- **THEN** migration만을 위한 별도 Environment 또는 추가 수동 승인을 요구하지 않는다
