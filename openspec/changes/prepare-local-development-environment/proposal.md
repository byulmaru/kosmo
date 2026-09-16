## Why

현재 로컬 개발 경로는 Temporal만 자동으로 준비하고 PostgreSQL의 database, role, ACL, migration, Local Instance 준비를 명시적인 수명 주기로 제공하지 않는다. 그 결과 실제 `pnpm dev`는 production과 동일한 `PG*` runtime 계약 및 Fedify queue 경계를 검증하지 못하므로, PROD-897에서 재현 가능한 최초 준비와 비파괴 반복 실행을 하나의 로컬 개발 계약으로 정의한다.

## What Changes

- loopback `127.0.0.1:54328`에 영속 PostgreSQL을 제공하고 application database `kosmo`와 Fedify queue database `kosmo_fedify_queue`를 분리한다.
- 최초 준비 명령에서 migration owner `kosmo`, application non-owner `kosmo_runtime`, queue owner를 분리해 role/ACL을 준비하고 migration과 Local Instance bootstrap을 수행한다.
- 반복 `pnpm dev`는 PostgreSQL data를 reset/seed/delete하지 않고 API, Web, App, Worker, Fedify consumer를 로컬 PostgreSQL 및 ephemeral Temporal에 연결한다.
- application runtime은 표준 `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`만 사용하고 `DATABASE_URL` fallback을 추가하지 않는다.
- local runtime 및 bootstrap credential은 지정된 Vault path에서 사람이 설정하며 source, default, log, artifact에 비밀번호를 기록하지 않는다.
- PostgreSQL 영속성과 Temporal 임시 저장소의 서로 다른 lifecycle, 최초 준비와 평상시 실행 절차, credential 경계를 문서화한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `openspec/specs/application-runtime-postgres-role/spec.md`, `openspec/specs/runtime-postgres-scram-credential-provisioning/spec.md`, `openspec/specs/fedify-postgres-message-queue-runtime/spec.md`
- Linear Contract: `PROD-897`
- Linear Implementations: `PROD-897`, GitHub PR `#773`

## Capabilities

### New Capabilities

- `local-development-environment`: 로컬 PostgreSQL의 최초 준비와 영속 반복 실행, Temporal 임시 실행, application 및 Fedify consumer runtime 경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- root `pnpm` 개발 명령과 로컬 environment 검증/준비 script
- local PostgreSQL 및 Temporal Docker Compose 구성
- API, Web, App, Worker, Fedify consumer 개발 process 환경
- Drizzle migration과 Local Instance bootstrap 실행 경계
- README 및 workspace script 운영 지침
