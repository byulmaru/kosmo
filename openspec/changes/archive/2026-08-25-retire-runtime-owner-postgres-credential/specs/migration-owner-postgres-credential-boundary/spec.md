## ADDED Requirements

### Requirement: 모든 migration은 CNPG-managed owner credential로 실행한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-712`. Dev와 production migration Job은 같은 release의 CloudNativePG application-user Secret으로 schema owner `kosmo`에 직접 연결해야 한다(MUST). 별도 member login으로 연결하거나 연결 뒤 owner role로 전환해서는 안 된다(MUST NOT).

#### Scenario: Dev와 production migration owner 연결

- **WHEN** dev 또는 production migration Job manifest를 렌더한다
- **THEN** `PGUSER`는 `kosmo`이고 `PGPASSWORD`는 같은 release PostgreSQL Cluster의 generated `<cluster-name>-app` Secret `password` key를 참조해야 한다
- **AND** `DATABASE_MIGRATION_ROLE`, `kosmo_migration` SecretRef 또는 runtime credential SecretRef가 나타나서는 안 된다

#### Scenario: Owner credential 연결 실패

- **WHEN** CNPG application-user Secret이 없거나 owner 연결을 만들 수 없다
- **THEN** migration Job은 schema SQL을 실행하지 않고 실패해야 한다
- **AND** `kosmo_runtime`, legacy application 또는 Fedify queue credential로 재시도해서는 안 된다

### Requirement: Owner는 migration 전용 active consumer 경계를 유지한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-712`, `PROD-780`. Schema owner `kosmo`는 migration을 위해 `LOGIN`과 CNPG-managed password를 유지해야 하고(MUST), database/schema/table ownership을 유지해야 한다(MUST). API, Web, Temporal Worker, Fedify application consumer와 Fedify MessageQueue consumer는 owner credential을 사용해서는 안 된다(MUST NOT).

#### Scenario: Active workload credential 분리

- **WHEN** dev와 production의 현재 활성 workload와 database connection principal을 검증한다
- **THEN** API/Web/Worker/Fedify application connection은 `kosmo_runtime LOGIN NOBYPASSRLS`를 사용해야 한다
- **AND** migration Job 외 active workload에는 `<cluster-name>-app` SecretRef 또는 `PGUSER=kosmo`가 없어야 한다
- **AND** Fedify MessageQueue는 전용 database/role/credential을 유지해야 한다

#### Scenario: Owner ownership 보존

- **WHEN** migration credential 전환 전후 database catalog를 비교한다
- **THEN** `kosmo`는 application database, schema와 기존 application 객체 ownership을 유지해야 한다
- **AND** runtime role에 ownership, owner membership 또는 DDL 권한을 새로 부여해서는 안 된다

### Requirement: Obsolete migration identity와 credential 경로를 제거한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-712`. Owner 직접 연결 전환이 검증된 뒤 `kosmo_migration` DatabaseRole, owner membership, Vault/VSO credential source와 Kubernetes Secret consumer를 제거해야 한다(MUST). `kosmo_migration`에 유효한 login 또는 owner 권한 경로가 남아서는 안 된다(MUST NOT).

#### Scenario: Desired manifest에서 migration identity 제거

- **WHEN** dev와 production Helm manifest를 렌더한다
- **THEN** `kosmo_migration` DatabaseRole, migration-database VaultStaticSecret, `<release>-postgres-migration` SecretRef와 `DATABASE_MIGRATION_ROLE`가 나타나서는 안 된다
- **AND** migration Job의 CNPG application-user SecretRef만 owner credential consumer로 나타나야 한다

#### Scenario: Database role cleanup preflight

- **WHEN** obsolete `kosmo_migration` database role을 제거한다
- **THEN** active session, owned object와 필요한 dependency가 없음을 먼저 검증해야 한다
- **AND** 검증이 실패하면 role 또는 credential 경로를 부분 제거하지 않고 production cleanup을 중단해야 한다

#### Scenario: Database role cleanup 완료

- **WHEN** migration owner 전환과 cleanup이 성공한다
- **THEN** database catalog에 `kosmo_migration`의 유효 login·owner membership 경로가 남아서는 안 된다
- **AND** owner `kosmo`와 runtime·queue role은 각 기존 책임을 유지해야 한다

### Requirement: Historical owner revision 잔여 위험과 production gate를 기록한다

**Authority / Provenance:** `docs/operations/production-release.md`, `docs/operations/postgres-backup.md`, Linear `PROD-712`. Production 전환은 최신 backup/WAL 상태, active owner connection drain, current workload readiness와 별도 승인을 확인한 뒤 수행해야 한다(MUST). replicas=0인 controller-retained historical owner ReplicaSet은 지원되는 rollback 대상이 아니어야 하며(MUST NOT), 재활성화 시 owner credential을 다시 소비할 수 있다는 잔여 위험을 기록해야 한다(MUST).

#### Scenario: Production 전환 승인 전

- **WHEN** production migration credential 또는 database role cleanup을 적용하려 한다
- **THEN** latest backup/WAL, current principal, active owner connection과 workload readiness evidence를 수집해야 한다
- **AND** 별도 production 승인 전에는 credential consumer 또는 database role을 변경해서는 안 된다

#### Scenario: Historical revision 보존

- **WHEN** replicas=0인 historical ReplicaSet이 owner SecretRef를 포함한다
- **THEN** PROD-712는 해당 ReplicaSet을 수동 삭제하거나 revision history를 축소하지 않아야 한다
- **AND** 해당 revision은 지원되는 rollback 대상에서 제외하고 재활성화 시 owner 접근이 복원될 수 있음을 운영 기록에 남겨야 한다
