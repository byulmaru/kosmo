## Why

현재 Drizzle PostgreSQL migrator는 실행 시점의 모든 pending migration과 history 기록을 하나의 transaction으로 묶으므로, 한 파일에서 기존 enum에 값을 추가하고 다음 파일에서 그 값을 사용하는 표준 PostgreSQL 변경을 한 번의 배포에서 실행할 수 없다. PROD-321을 안전하게 진행하고 이후 migration에서도 schema와 Drizzle history의 일관성을 유지하려면 migration 파일을 독립적인 commit 단위로 실행하는 공통 runner 계약이 필요하다.

## What Changes

- Drizzle migration 디렉터리, statement breakpoint, 정렬, hash와 기존 `drizzle.__drizzle_migrations` history 형식을 유지하면서 각 migration 파일을 독립 transaction으로 적용한다.
- 한 파일의 SQL과 history insert를 같은 transaction에서 commit하거나 rollback하고, 중간 파일 실패 뒤에는 마지막 성공 파일 다음부터 재실행한다.
- 적용된 history가 로컬 migration의 유효한 순서와 내용을 나타내는지 실행 전에 검증하고 누락, 순서 변경 또는 적용된 hash 변경을 거부한다.
- 기존 advisory lock, 단일 database connection과 migration role 전환을 유지한다.
- 전체 pending batch가 아니라 migration 파일이 atomicity와 복구의 단위임을 dev/production 운영 계약과 runbook에 반영한다.
- migration SQL 내부의 `COMMIT; BEGIN;`, enum별 preflight와 Kosmo 고유 migration/history 형식은 도입하지 않는다.

## Authority / Provenance

- Canonical: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, `memory/database-design.md`
- Linear Contract: `PROD-269`
- Linear Implementations: `PROD-656`; blocked consumer `PROD-321`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `dev-database-migrations`: runtime migration command의 적용, 실패, history와 재실행 단위를 전체 pending batch가 아니라 migration 파일로 명시한다.
- `production-migration-gate`: production의 기존 `migrate` command가 같은 파일 단위 atomicity와 partial-apply 복구 계약을 사용하도록 명시한다.

## Impact

- `packages/core/db/migrate.ts`의 Drizzle migrator 호출과 migration history 검증 경계
- migration runner integration tests와 PostgreSQL test database 준비
- `docs/operations/production-migrations.md` 및 적용되는 database migration memory
- dev PreSync와 production migration Job의 command interface는 `migrate`로 유지되지만, 중간 실패 시 성공한 앞 파일은 history와 함께 남는 것으로 운영 의미가 변경된다.
- Drizzle ORM/Kit dependency 버전 변경은 포함하지 않으며, upstream 파일별 transaction 지원이 릴리스되면 같은 호환성 검증을 거쳐 자체 실행 경계를 제거할 수 있다.
