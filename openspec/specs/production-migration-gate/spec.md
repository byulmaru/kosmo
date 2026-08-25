# production-migration-gate Specification

## Purpose

Production migration이 고정된 database 대상과 분리된 credential을 사용하고 모든 활성화 workload와 동일한 immutable release에서 실행되며, 성공하기 전에는 새 workload가 활성화되지 않도록 하는 실행 경계를 정의한다.

## Requirements

### Requirement: 분리된 production migration 권한

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-564`, `PROD-616`, `PROD-712`. Production migration Job은 schema owner `kosmo`의 CloudNativePG-managed application-user credential을 사용해야 하며(MUST), runtime workload credential을 사용하거나 owner credential이 없을 때 runtime credential로 fallback해서는 안 된다(MUST NOT). Owner credential consumer는 migration Job으로 제한해야 한다(MUST).

#### Scenario: Owner credential로 직접 실행

- **WHEN** production migration Job이 시작된다
- **THEN** Job은 현재 Helm release PostgreSQL Cluster의 generated application-user Secret으로 owner `kosmo`에 직접 연결한다
- **AND** 별도 migration identity로 연결하거나 연결 뒤 `SET ROLE`을 수행하지 않는다
- **AND** 접속 대상은 현재 Helm release의 PostgreSQL read-write Service와 `kosmo` database로 고정된다
- **AND** Runtime workload는 같은 credential을 mount하거나 참조하지 않는다

#### Scenario: Migration 대상 입력 금지

- **WHEN** production migration Job manifest가 렌더된다
- **THEN** database URL, host, database와 migration Secret 이름/key를 release 입력으로 받지 않는다
- **AND** 같은 release의 CNPG-generated application-user Secret에서는 `password`만 읽고 `PGUSER`는 owner `kosmo`로 고정한다

#### Scenario: Owner credential 준비 실패

- **WHEN** CNPG-generated application-user Secret이 없거나 유효한 owner database 연결을 만들 수 없다
- **THEN** migration Job은 SQL을 실행하지 않고 실패한다
- **AND** runtime, legacy application 또는 Fedify queue credential로 재시도하지 않는다

### Requirement: 동일한 immutable release identity

**Authority / Provenance:** `PROD-564`, `PROD-269`. Production migration Job과 모든 활성화 workload는 승인된 release의 동일한 immutable image digest를 사용해야 한다(MUST). Mutable tag 또는 서로 다른 digest로 production migration을 실행해서는 안 된다(MUST NOT).

#### Scenario: 동일 digest로 렌더

- **WHEN** production release manifest가 렌더된다
- **THEN** migration Job과 모든 활성화 workload image reference는 같은 `repository@sha256:...` 값이다

#### Scenario: Mutable production image 거부

- **WHEN** production migration이 tag-only image 또는 유효하지 않은 digest로 구성된다
- **THEN** manifest render는 migration Job을 생성하기 전에 실패한다

### Requirement: 단순한 migration 실행기

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-564`, `PROD-656`. Production migration Job은 release image의 `migrate` command만 실행해야 하며(MUST), 이 command는 version-controlled Drizzle migration 형식과 기존 history를 유지하면서 DB history의 각 적용 name/hash를 local migration과 검증하고 적용된 name을 제외한 pending migration 파일의 SQL과 history insert를 독립 transaction으로 적용해야 한다(MUST). DB row 순서가 local timestamp 정렬과 달라도 같은 name/hash 집합이면 유효하게 인식해야 하며(MUST), local에 없는 history, hash 변경과 중복 name/history는 새 SQL 전에 거부해야 한다(MUST NOT). Generic phase selector, schema authority input, database target input, restore-point command 또는 backup/compatibility collector를 포함해서는 안 된다(MUST NOT).

#### Scenario: Production migration 실행

- **WHEN** production migration Job이 렌더된다
- **THEN** container argument는 `migrate`이다
- **AND** runner는 기존 Drizzle migration directory, history와 advisory lock을 사용한다
- **AND** 각 pending migration 파일의 SQL과 history insert를 같은 독립 transaction에서 적용한다

#### Scenario: 비선형 existing history 재실행

- **WHEN** production database의 Drizzle history row 순서가 local migration timestamp 정렬과 다르지만 모든 적용 name/hash가 local과 일치한다
- **THEN** runner는 history row와 ID를 재작성하지 않고 이미 적용된 name을 건너뛴다
- **AND** 아직 적용되지 않은 migration만 local version-control 순서로 실행한다

#### Scenario: Legacy history 승격

- **WHEN** production database의 기존 Drizzle history에 name이 없고 각 row의 timestamp/hash가 local migration과 대응한다
- **THEN** runner는 Drizzle beta.22와 호환되는 timestamp 우선·hash 보조 mapping으로 name을 backfill한다
- **AND** 기존 history row 순서와 ID를 보존한 뒤 pending migration을 local 순서로 실행한다
- **AND** unknown·ambiguous·duplicate mapping은 history shape 또는 schema를 변경하거나 새 SQL을 실행하기 전에 실패한다

#### Scenario: History 무결성 위반

- **WHEN** production database history에 local에 없는 name, hash가 변경된 name 또는 duplicate name이 있다
- **THEN** runner는 새 migration SQL을 실행하기 전에 실패한다
- **AND** history를 현재 local 상태로 덮어쓰거나 재정렬하지 않는다

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
- **AND** 이전에 실패한 파일을 포함해 history에 없는 파일만 local version-control 순서로 적용을 계속한다

#### Scenario: 중복 승인 금지

- **WHEN** production release가 승인됐다
- **THEN** migration만을 위한 별도 Environment 또는 추가 수동 승인을 요구하지 않는다
