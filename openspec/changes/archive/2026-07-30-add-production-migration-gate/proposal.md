## Why

현재 Helm migration Job은 dev에서만 렌더되고 application database credential과 mutable `main` image를 사용한다. 이 경계를 그대로 production에 사용하면 migration과 API/Web workload가 서로 다른 build를 실행하거나 runtime identity에 DDL 권한을 요구하게 된다.

Linear [PROD-564](https://linear.app/byulmaru/issue/PROD-564/프로덕션-migration-job을-release-실행-경계에-연결한다)는 production migration을 동일 immutable release와 별도 database credential로 실행하고, 실패 시 새 workload 활성화를 차단하는 최소 실행 경계를 소유한다.

## What Changes

- Production migration Job이 runtime workload와 분리된 migration credential만 사용하고 runtime credential로 fallback하지 않게 한다.
- Migration Job, API와 Web workload가 하나의 immutable image digest를 사용하게 한다.
- Migration Job은 기존 Drizzle runner의 `migrate` command만 실행하고 phase, schema authority 또는 restore command mode를 갖지 않는다.
- PROD-563의 production release 승인 하나가 migration과 API/Web 배포를 함께 승인하며 migration 성공 전 workload 활성화를 차단한다.
- 실제 destructive migration의 phase, backup/restore, compatibility와 rollback 조건은 해당 schema migration 이슈·PR·release가 구체적으로 소유한다.

## Authority / Provenance

- Canonical: 없음 — production 실행 경계다.
- Repository Policy: `memory/database-migrations.md`
- Linear Contract: `PROD-564`
- Related Linear Contract: `PROD-269`

## Capabilities

### New Capabilities

- `production-migration-gate`: Production migration의 credential, immutable release identity와 성공 전 workload activation 차단을 검증하는 실행 계약.

### Modified Capabilities

없음.

## Impact

- Deployment: production migration Job의 credential과 immutable image 경계.
- Operations: credential, lock, SQL과 timeout 실패 뒤 같은 release 재시도 또는 forward recovery 절차.
- Database: 기존 Drizzle history와 advisory lock을 그대로 재사용한다.
- Excluded owners: PROD-562 runtime/Secret provisioning, PROD-563 일반 release pipeline, 실제 destructive schema migration, PROD-565 첫 release 검증.
