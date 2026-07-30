## Context

현재 runtime image에는 `drizzle/`과 `migrate` entrypoint가 포함되어 있고, runner는 Drizzle history와 PostgreSQL advisory lock을 사용한다. 그러나 Helm migration Job은 dev에서만 렌더되고 application credential과 mutable `main` image를 사용한다. Runner는 image 안의 미적용 migration을 모두 실행하므로 SQL 파일 자체를 `expand`/`transition`/`contract`로 선택하지 않는다.

Production backup은 CNPG Barman Cloud plugin, 매일 base backup과 연속 WAL archive, 격리 PITR rehearsal runbook을 이미 제공한다. PROD-564는 이 기능을 재구현하지 않고 contract gate의 입력으로 소비한다. Production runtime, 일반 release orchestration과 실제 첫 release 검증은 각각 PROD-562, PROD-563, PROD-565가 소유한다.

## Goals / Non-Goals

**Goals:**

- Production migration이 별도 database credential과 동일 immutable release digest를 사용하게 한다.
- 하나의 gate interface가 phase, evidence, workload compatibility와 rollback window를 fail-closed로 검증하게 한다.
- Production release 승인 하나를 migration과 workload 전체에 적용하고 contract에는 강화된 자동 evidence gate만 추가한다.
- Migration 실패가 새 workload 활성화를 차단하고 안전한 재시도·복구 판단 경계를 남기게 한다.

**Non-Goals:**

- 특정 schema migration이나 backfill 구현.
- Phase-aware Drizzle migration runner 또는 별도 migration history 도입.
- S3 backup, WAL archive, PITR와 restore rehearsal 구현.
- Production Application, namespace, Vault engine/role lifecycle 또는 일반 release 승인 UI 구현.
- 실제 첫 production release, public smoke, replica/failover 또는 database 자동 rollback.

## Implementation Guidance

### Current Constraints

- `packages/core/db/migrate.ts`는 pending migration 전체를 실행하고 advisory lock만 제공한다.
- `apps/helm/templates/database-migration-job.yaml`은 dev 전용이며 CNPG application Secret을 사용한다.
- `apps/terraform/argocd.tf`는 현재 dev Application만 선언한다.
- `docs/operations/postgres-backup.md`의 restore evidence는 비민감 측정값과 Linear reference로 남고 backup content나 credential은 기록하지 않는다.
- Production 배포 승인 경계는 PROD-563이 소유하며 PROD-564는 별도 approval surface를 만들지 않는다.

### Recommended Approach

1. PROD-563의 일반 release workflow가 직접 호출할 수 있는 독립 gate command를 둔다. 이 command는 immutable image digest, migration phase, schema-change authority, rollback window 종료 시각, compatibility allowlist와 restore rehearsal evidence reference를 입력으로 받는다.
2. Production Helm render에서 migration Job과 API/Web image가 같은 digest인지 정적으로 검사하고 migration Job은 별도 Secret reference만 사용하게 한다.
3. `expand`/`transition`은 필수 identity·credential·phase 검사를 통과하면 기존 Drizzle runner를 실행한다. Phase별 SQL 선택은 하지 않고 release/image 분리로 안전한 migration 집합을 보장한다.
4. `contract`는 recovery window 안의 base backup과 연속 WAL chain, 월간 restore rehearsal의 overdue 여부, live active/preview/rollback workload digest와 rollback window를 검사한다. 이후 고유한 named restore point를 만들고 해당 target WAL의 archive 성공을 확인한다. 이 자동 조건이 모두 충족되면 이미 승인된 production release의 migration을 실행한다.
5. Gate와 migration 결과를 호출자에게 명시적 success/failure로 반환한다. PROD-563은 success일 때만 workload 활성화를 이어가며, 이 change는 일반 release orchestration 자체를 만들지 않는다.
6. 운영 문서는 evidence 수집, 실패 원인 분류, 같은 digest 재시도, forward recovery와 restore 판단 시점을 설명한다.

### Allowed Alternatives

- Gate는 repository command 또는 PROD-563 release workflow가 직접 호출하는 module로 구현할 수 있다.
- Live workload 검사는 `kubectl` 또는 동일한 Argo Rollouts API 조회로 구현할 수 있다.
- Restore evidence는 production workflow artifact나 deployment record로 대체할 수 있다. 단, evidence reference, 월간 rehearsal overdue 판정과 비민감 로그를 유지해야 한다.
- Migration credential은 password 또는 short-lived certificate일 수 있다. 단, runtime credential과 분리되고 runtime workload에 노출되지 않으며 fallback 없이 실패해야 한다.

### Known Traps

- Contract SQL을 transition image에 미리 포함하고 runner가 건너뛸 것으로 기대하지 않는다.
- `PostSync` 성공이나 non-current ReplicaSet의 scale 0만으로 rollback window 종료를 증명하지 않는다.
- SemVer/stable/SHA tag를 immutable digest와 동일하게 취급하지 않는다.
- Evidence input의 non-empty 여부만 검사하고 recovery chain, rehearsal overdue 상태와 restore point WAL archive 확인을 생략하지 않는다.
- Production release가 승인된 뒤 contract migration만 다시 승인하게 하는 별도 Environment나 workflow를 추가하지 않는다.
- Migration credential 장애를 runtime credential 재사용으로 우회하지 않는다.
- Secret, connection string, backup object key, row 값 또는 raw Kubernetes Secret을 workflow log에 출력하지 않는다.
- PROD-562/563/565의 리소스·workflow·실배포 책임을 이 change의 완료 task로 가져오지 않는다.

## Risks / Trade-offs

- 일일 base backup 지연은 PROD-546의 운영 이상이지만, 기존 base backup과 연속 WAL이 migration 직전 restore point까지 유효하면 그 경과 시간만으로 contract를 차단하지 않는다. 반대로 recovery chain이나 월간 rehearsal readiness가 깨졌다면 contract release도 보류된다.
- Named restore point의 target WAL archive를 기다리므로 contract 시작이 WAL 전환·업로드 시간만큼 지연될 수 있다. 이 지연은 destructive migration 직전 복구 지점을 확보하는 비용이다.
- Compatibility allowlist는 특정 schema-change authority가 정확한 release identity를 기록해야 한다. Gate는 live workload와 allowlist 일치 여부를 검증하지만 특정 migration의 compatibility 자체를 대신 판단하지 않는다.
- Production release 승인은 image 안의 migration까지 포함하므로 contract 의도를 별도 승인 행위로 중복 기록하지 않는다. 대신 phase, schema authority, recovery와 compatibility evidence가 release 기록에 남아야 한다.
- 자동 database rollback을 제공하지 않으므로 실패 후 forward fix 또는 restore 판단이 운영자에게 남는다. 임의 down migration보다 데이터 안전성이 높다.

## Migration Plan

1. 이 OpenSpec을 strict validation하고 사용자 승인을 받는다.
2. PROD-564에서 gate interface, production migration Job 경계, phase/evidence/workload 검사와 runbook/test를 구현한다.
3. PROD-562와 PROD-563이 제공하는 production runtime 및 release pipeline에 gate interface를 연결하되 해당 구현을 이 change에 복제하지 않는다.
4. Manifest fixture와 실패 경로를 검증한 뒤 PROD-564 PR을 Ready로 준비한다.
5. 실제 production backup/restore와 첫 release 통합 검증은 PROD-546과 PROD-565에서 수행한다.

Rollback은 gate와 production migration Job 활성화를 이전 revision으로 되돌리는 방식이다. 이미 적용된 migration은 자동으로 되돌리지 않으며 같은 release 재시도, 새 forward migration 또는 승인된 restore 절차 중 하나를 운영자가 선택한다.

## Open Questions

없음.
