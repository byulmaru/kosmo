## Why

현재 dev 배포는 `main`의 Docker image build가 성공하면 `latest` image를 사용하는 API와 web Rollout만 restart하고, 새 Drizzle migration을 실제 PostgreSQL에 적용하지 않는다. 파괴적 schema 변경이 포함된 PROD-267을 데이터 reset 없이 배포하고 이후 migration 누락으로 새 workload가 깨지는 일을 막으려면, DB migration 성공을 dev rollout의 선행 조건으로 만들어야 한다.

Linear: [PROD-280](https://linear.app/byulmaru/issue/PROD-280/dev-배포-전에-drizzle-migration-job을-실행한다)

## What Changes

- runtime image가 version control의 Drizzle SQL migration을 포함하고 독립적인 `migrate` command로 pending migration을 적용한다.
- migration runner는 Drizzle migration history를 사용하고 PostgreSQL advisory lock으로 동시 실행을 거부한다.
- Helm chart에 app startup 및 initContainer와 분리된 단일 Argo CD `PreSync` migration Job을 추가한다.
- Deploy Dev workflow는 Docker Build 성공 후 Argo CD full sync로 migration을 완료하고, 성공한 경우에만 기존 API/web Rollout restart를 실행한다.
- migration-aware dev deploy를 직렬화해 실행 중 workflow를 새 배포가 취소하지 않게 한다.
- dev는 기존 `latest` image 정책과 허용된 짧은 downtime을 유지하며 DB data를 reset하지 않는다.
- production immutable release, expand/transition/contract 승인, backup/restore와 배포 후 smoke는 포함하지 않는다.

## Capabilities

### New Capabilities

- `dev-database-migrations`: dev workload rollout 전에 pending Drizzle migration을 단일 실행하고 실패 시 rollout을 차단하는 배포 계약.

### Modified Capabilities

없음.

## Impact

- Runtime: `Dockerfile`, `docker-entrypoint.sh`, production dependency로 제공되는 Drizzle migrator와 SQL migration directory.
- Deployment: `apps/helm`의 `PreSync` Job, DB secret 사용 경계, `.github/workflows/deploy-dev.yml`의 sync/restart 순서와 concurrency.
- Database: Drizzle `__drizzle_migrations` history와 PostgreSQL advisory lock; 기존 domain table과 migration SQL 내용은 변경하지 않는다.
- Verification: migration runner unit/integration, Helm render, workflow ordering, existing lint/format/OpenSpec validation.
