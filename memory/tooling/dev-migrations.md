# Script Memory: Dev Database Migrations

## Dev database migrations

- dev 배포는 `Deploy Dev`가 `kosmo-dev` 애플리케이션을 full sync하고, Argo CD `Sync` wave 1 Job이 같은 `main` 런타임 이미지의 `migrate` entrypoint를 실행한 뒤 wave 2 workload를 적용하고 API/web Rollout과 렌더된 background Deployment를 restart한다. sync나 migration이 실패하면 workload를 교체하거나 restart하지 않는다.
- migration runner는 Drizzle history와 PostgreSQL advisory lock을 사용한다. 적용된 history의 각 name이 local migration에 존재하고 hash가 같은지 검증하되, DB row 순서가 local timestamp 정렬과 달라도 같은 name/hash 집합이면 유효하게 인식한다. 이미 적용된 name을 제외한 파일만 local reader 순서로 실행하고, 각 파일의 SQL과 history insert를 독립 transaction으로 commit한다. 한 파일 실패 시 해당 파일은 rollback되고 앞서 성공한 파일은 유지되며, 재실행은 적용된 name/hash를 건너뛰고 미적용 파일만 이어간다. `Deploy Dev` 실행도 취소하지 않고 직렬화하므로 동일 DB에 migration을 동시에 적용하지 않는다.
- dev migration은 기존 dev DB와 credential을 그대로 사용하고 데이터를 reset하지 않는다. dev downtime은 허용한다.
- 로컬에서는 `pnpm --filter @kosmo/core db:migrate`로 같은 runner를 실행한다. `packages/core/drizzle.config.ts`의 `out`과 `migrations`가 migration directory와 Drizzle history schema/table의 source of truth이며, 런타임 이미지에는 config가 가리키는 migration 파일이 포함된다. Dev와 production Job은 PostgreSQL Cluster의 generated `<cluster>-app` Secret `password`와 `PGUSER=kosmo`로 owner에 직접 연결한다. Database URL 또는 PostgreSQL 환경은 runner 입력으로 유지하되 `DATABASE_MIGRATION_ROLE`과 `SET ROLE`은 사용하지 않는다.
- disposable PostgreSQL에서 실제 package entrypoint와 config가 가리키는 migration 경로를 확인하려면 `pnpm --filter @kosmo/core test:migrate:smoke`를 실행한다. 이 smoke는 `scripts/test-db.mjs`로 빈 database를 만든 뒤 `pnpm --filter @kosmo/core db:migrate`를 실행하고, history ID를 비선형 순서로 바꾼 뒤 같은 entrypoint의 no-op 재실행이 history를 변경하지 않는지와 대표 최종 schema를 확인한다. 비선형 history 뒤 pending 선택은 `migrate.test.ts`의 직접 integration에서 검증한다.
- production의 immutable image, expand/contract, backup/rollback/approval gate와 배포 smoke는 production migration runbook과 PROD-269 계약을 따르며, dev 성공만으로 production gate가 검증됐다고 보지 않는다.
