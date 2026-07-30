## Why

현재 Kosmo의 migration runner와 Argo CD `PreSync` Job은 dev의 mutable `main` image와 application database credential을 사용하며, image 안의 미적용 Drizzle migration을 phase 구분 없이 모두 실행한다. 이 경계를 그대로 production에 사용하면 migration과 workload의 release identity가 어긋나거나, rollback 가능한 구버전 workload가 남은 상태에서 파괴적 contract migration이 실행될 수 있다.

Linear [PROD-564](https://linear.app/byulmaru/issue/PROD-564/프로덕션-migration과-contract-gate를-release에-연결한다)는 PROD-269의 expand → transition → contract 정책과 PROD-546의 backup/restore 증거를 production release가 소비하도록 만들고, migration 실패 시 새 workload 활성화를 차단하는 독립 결과를 소유한다.

## What Changes

- Production migration Job이 runtime workload와 분리된 migration credential만 사용하고 runtime credential로 fallback하지 않게 한다.
- Migration Job, API와 Web workload가 하나의 immutable image digest를 사용한다는 gate를 제공한다.
- Release가 `expand`, `transition`, `contract` phase와 해당 schema-change authority를 명시하게 하고, phase별 조건을 검증한다.
- Contract phase에서는 유효한 base backup과 연속 WAL recovery chain, overdue가 아닌 restore rehearsal, migration 직전 restore point의 WAL archive, rollback window 종료와 active/preview/rollback workload compatibility를 모두 확인한다.
- PROD-563의 production release 승인 하나가 해당 image의 migration과 API/Web 배포를 함께 승인하며 contract 전용 추가 승인을 요구하지 않는다.
- Migration 실패 시 새 workload 활성화를 중단하고, 같은 release identity로 재시도하거나 운영자가 복구 판단을 내릴 수 있는 runbook을 제공한다.
- 특정 schema migration, backup/PITR 구현, 일반 production release 승인 UI와 실제 첫 release 검증은 추가하지 않는다.

## Authority / Provenance

- Canonical: 없음 — 도메인·디자인 행동 변경이 아닌 production 운영 안전 경계다.
- Repository Policy: `memory/database-migrations.md`, `docs/operations/postgres-backup.md`
- Linear Contract: `PROD-564`
- Related Linear Contracts: `PROD-269`, `PROD-546`
- Linear Implementations: `PROD-564`

## Capabilities

### New Capabilities

- `production-migration-gate`: Production release의 migration identity, credential, phase, backup/restore evidence, workload compatibility와 실패 차단을 검증하는 배포 계약.

### Modified Capabilities

없음.

## Impact

- Deployment: production migration Job의 값·credential·immutable image 경계와 PROD-563 release pipeline이 호출할 수 있는 gate interface.
- Operations: production release 승인 뒤 backup/restore evidence reference, rollback window와 workload compatibility를 자동 확인하는 절차.
- Database: 기존 Drizzle history와 advisory lock을 재사용하며 migration SQL이나 phase별 migration directory를 새로 만들지 않는다.
- Verification: phase별 gate fixture, Helm dev/prod render, credential·digest 불일치, stale evidence, 구버전 workload와 migration failure 회귀 검증.
- Excluded owners: PROD-562 runtime 구성, PROD-563 일반 release pipeline, PROD-565 실제 첫 release 및 public smoke.
