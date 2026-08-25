## MODIFIED Requirements

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
