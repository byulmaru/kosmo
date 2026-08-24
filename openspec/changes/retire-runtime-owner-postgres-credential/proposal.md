## Why

Application runtime은 `kosmo_runtime` 비소유 role로 전환됐지만 migration identity는 dev의 owner 직접 로그인과 production의 `kosmo_migration → SET ROLE kosmo`로 갈라져 있다. Migration이 어차피 owner 권한을 행사하고 CloudNativePG가 owner credential을 관리하므로, 모든 환경을 CNPG owner credential 하나로 통합하고 runtime 소비만 금지해 중복된 고권한 role·Secret 경로를 제거한다.

## What Changes

- Dev와 production migration Job이 같은 release의 CNPG-generated application-user Secret으로 owner `kosmo`에 직접 접속하게 한다.
- Production migration의 `kosmo_migration` credential과 `DATABASE_MIGRATION_ROLE=kosmo` role transition을 제거한다.
- `kosmo_migration` DatabaseRole, owner membership, VaultStaticSecret/VSO destination과 유효 login path를 제거한다.
- Owner `kosmo`는 migration을 위해 `LOGIN`, CNPG-managed password와 database/schema/table ownership을 유지한다.
- API/Web/Worker/Fedify active runtime은 owner Secret을 소비하지 않고 `kosmo_runtime` credential을 유지한다.
- Migration owner Secret이 없거나 연결이 실패하면 runtime credential로 fallback하지 않고 실패한다.
- replicas=0인 controller-retained historical owner ReplicaSet은 삭제하지 않으며, 재활성화 시 owner credential을 다시 소비할 수 있음을 지원 외 rollback의 잔여 위험으로 기록한다.
- Production 전환은 backup·active connection·workload 상태를 확인하고 별도 승인 뒤 수행한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/operations/production-migrations.md`, `docs/operations/production-release.md`, `docs/operations/postgres-backup.md`, `docs/operations/postgres-session-pool.md`, `memory/database-migrations.md`, `memory/script.md`
- Linear Contract: `PROD-712`
- Linear Implementations: `PROD-712`; prerequisite production transition `PROD-780`

## Capabilities

### New Capabilities

- `migration-owner-postgres-credential-boundary`: 모든 환경의 migration owner 직접 로그인, runtime 비소비, obsolete migration identity 제거와 historical rollback 잔여 위험을 정의한다.

### Modified Capabilities

- `production-migration-gate`: production migration이 별도 member login과 role transition 대신 CNPG-managed owner credential로 직접 접속하도록 변경한다.
- `application-runtime-postgres-role`: shared runtime 전환이 보존해야 하는 migration 경계를 obsolete member login이 아니라 CNPG-managed owner 직접 연결로 갱신한다.
- `runtime-postgres-scram-credential-provisioning`: production migration 전용 Vault/VSO credential 보존 요구를 제거하고 owner credential과 runtime credential의 consumer 경계를 명시한다.
- `workload-postgres-credential-selection`: runtime selector와 독립된 migration baseline을 모든 환경의 CNPG-managed owner 직접 연결로 갱신한다.

## Impact

- `apps/helm/templates/database-migration-job.yaml`, `postgres-migration-role.yaml`, `vaultstaticsecret.yaml`
- `packages/core/db/migrate.ts`의 optional role transition과 migration runner tests
- Helm render/contract tests와 production migration role-level 검증
- Production migration·release·session pool 운영 문서와 database/script lifecycle memory
- CloudNativePG application-user Secret, Vault/VSO migration credential, production PostgreSQL role catalog
- API/Web/Worker/Fedify application 동작이나 GraphQL schema에는 변경이 없다.
