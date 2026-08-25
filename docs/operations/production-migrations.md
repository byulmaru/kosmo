# Production migration 실행 경계

## 책임

Production migration은 모든 활성화 workload와 canonical release manifest가 지정한 immutable image를 사용하지만 database consumer와 권한은 분리한다.

- Dev와 production의 migration Job은 현재 PostgreSQL Cluster가 생성한 `<cluster>-app` Secret의 `password`로 schema owner `kosmo`에 직접 로그인한다. Production Cluster `kosmo-postgres`의 Secret은 `kosmo-postgres-app`이며, `PGUSER=kosmo`는 고정한다.
- 별도 `kosmo_migration` login, Vault/VSO migration credential, `DATABASE_MIGRATION_ROLE` 또는 `SET ROLE` 경계를 migration 경로에 두지 않는다.
- Runtime workload는 `kosmo_runtime` credential만 사용한다. Owner Secret을 runtime에 복제하거나 migration 장애 시 runtime credential로 fallback하지 않는다.
- Production release workflow는 `workflow_dispatch`로만 실행한다. `main` push/merge는 canonical build와 dev 배포만 시작하며, dispatch에서 `target_sha`를 입력하면 해당 full SHA를 사용하고 비워 두면 preflight가 최신 `main` commit을 immutable target으로 확정한다. Preflight는 성공한 canonical manifest를 확인하고, `prod` Environment 승인 뒤에만 Argo CD credential, runtime public config와 migration/workload 상태를 변경한다. Production job은 image를 다시 build하거나 production Vault Sentry DSN을 조회하지 않으며, manifest의 동일 digest를 migration과 모든 활성화 workload에 전달한다.
- PROD-545는 runtime 준비, restore rehearsal, 첫 production release와 public smoke의 최종 통합을 검증한다.

Migration database identity는 schema/database owner `kosmo`이며 database와 기존 schema/table ownership을 유지한다. Runtime workload database identity `kosmo_runtime`에는 DDL 권한을 부여하지 않는다.

## Helm interface

Production migration Job은 다음 값만 사용한다.

- `env=prod`
- `imageDigest=sha256:<64 lowercase hex>`
- `migration.enabled=true`

Job과 모든 활성화 workload는 canonical manifest의 `image@sha256:...` 형태의 같은 image reference를 렌더한다. Production migration에서 mutable tag나 유효하지 않은 digest를 사용하면 Helm render가 실패한다.

Migration Job은 기반 리소스가 적용되는 기본 Sync wave 뒤의 wave 1에서 실행하고, API·Web Rollout·HPA와 background Deployment는 Job 성공 뒤 wave 2에서 교체한다. Migration을 `PreSync`로 실행하거나 workload와 같은 wave에 배치하지 않는다.

Application workload에는 별도 activation flag가 없다. API·Web Service·Rollout·HTTPRoute와 background Deployment는 chart에서 항상 렌더되며, `prod` Environment 승인 뒤 실행된 workflow_dispatch release job이 canonical target full SHA, immutable digest와 migration 설정을 갱신한다. 따라서 production Application에는 release workflow가 설정한 유효한 `imageDigest` parameter와 target source revision이 존재해야 한다. Dev와 production은 같은 canonical digest를 사용한다. `prod` Environment 승인은 해당 release의 production 상태 변경 전체를 보호하는 유일한 사람 승인이다.

Migration 대상은 Helm release의 PostgreSQL read-write Service, `5432` port와 `kosmo` database로 고정한다. Job은 현재 Cluster의 generated `<cluster>-app` Secret에서 `password`만 읽고 `PGUSER=kosmo`를 사용한다. Database URL, host, database 또는 owner Secret 이름/key를 release 입력으로 받지 않는다. Secret이 없거나 key가 누락되거나 owner 연결이 실패하면 Kubernetes/Job이 SQL 전에 실패하고 runtime·legacy·Fedify queue credential로 재시도하지 않는다.

Migration Job은 다음 command만 실행한다.

```text
migrate
```

Phase, schema authority, restore point, target LSN, workload compatibility 또는 rollback window는 이 Job의 value, annotation이나 command mode가 아니다.

`migrate`는 release image의 `packages/core/drizzle.config.ts`가 지정한 Drizzle migration directory를
version-control 순서로 읽고, config의 `migrations.schema`·`migrations.table`이 지정한 history(현재
`drizzle.__drizzle_migrations`)의 각 적용 name이 local migration에 존재하고 hash가 같은지 검증한다. 병렬
branch가 timestamp와 다른 순서로 merge·배포되어 history row 순서가 local 정렬과 달라도 같은 name/hash
집합이면 유효하게 인식하고, 이미 적용된 name을 제외한 pending 파일만 version-control 순서로 실행한다. Local에
없는 history, 같은 name의 hash 변경과 중복 name/history는 새 SQL 실행 전에 거부한다. 각 migration 파일의
statement와 해당 history insert는 같은 독립 transaction에 넣는다. 따라서 파일 하나가 성공하면 schema와
history가 함께 commit되고, 실패하면 그 파일의 변경만 함께 rollback된다. 앞에서 성공한 파일은 뒤 파일 실패로
되돌리지 않는다.

`drizzle.config.ts`의 `dbCredentials`는 Drizzle Kit CLI 설정이다. Runtime `migrate`는 이를 connection source로
사용하지 않고, Job이 주입한 PostgreSQL environment로 `kosmo`에 직접 연결한다. Migration runner에는 별도 role
transition 입력을 전달하지 않는다.

## Release 실행 순서

전체 target 선택, approval과 rollback 절차는 [Production release 운영 runbook](./production-release.md)을 따른다. 승인 job은 preflight가 고정한 canonical digest로 migration을 먼저 실행하고, 성공한 경우에만 같은 digest의 workload를 wave 2에서 활성화한다. Preflight나 migration이 실패하면 기존 workload를 유지한다.

Migration Job과 workload 사이의 success barrier는 PROD-564/PROD-783 구현을 사용하며 전체 release 완료 판단은 PROD-545가 소유한다.

## Production preflight와 postflight

Production migration 전환은 release 승인과 별도의 evidence gate를 유지한다. Preflight와 postflight는 `prod`
Environment의 required reviewer 승인을 대신하지 않으며, 승인 전에는 credential consumer·database role·Vault/VSO
source를 변경하지 않는다.

### Preflight

- 현재 dispatch target full SHA(입력 SHA 또는 preflight가 확정한 최신 `main`), workflow ref, immutable prod digest와 Helm render를 대조한다.
- 최신 Backup/WAL archive 상태, PostgreSQL Cluster Ready 상태, active `kosmo` owner connection drain과 API·Web·Worker·Fedify readiness를 확인한다.
- 같은 Cluster의 generated `<cluster>-app` Secret으로 비밀값을 출력하지 않는 read-only 연결 probe를 실행해 `session_user=current_user=kosmo`인지 확인한다. 이 probe가 실패하면 sync를 시작하지 않는다.
- Migration Job이 `PGUSER=kosmo`와 같은 Cluster의 `<cluster>-app` Secret `password`를 사용하고, usable `kosmo_migration` login/consumer, migration-database Secret/VaultStaticSecret, `DATABASE_MIGRATION_ROLE`와 `SET ROLE`이 렌더되지 않는지 확인한다. CNPG inline `ensure: absent` 선언은 role 재생성 방지를 위해 허용한다.
- Active workload가 `kosmo_runtime`를 사용하고 owner Secret을 참조하지 않는지 확인한다. replicas=0 historical owner ReplicaSet 목록은 기록하되 삭제하거나 revision history를 축소하지 않는다.
- 기존 `kosmo-postgres-migration` DatabaseRole과 `migration-database` VaultStaticSecret에는 `Prune=confirm`이 있으므로 Argo CD가 제시하는 prune 대상이 정확히 이 두 리소스인지 확인한다. 일반 `--prune`만으로 삭제 승인을 대신하지 않으며 다른 보호 리소스가 함께 나타나면 sync를 중단한다.

Role cleanup 전에는 비밀값 없이 다음 catalog 조건을 확인한다. 모든 count가 `0`이고 membership 조회가
`kosmo_migration → kosmo` 외의 dependency를 보이지 않을 때만 cleanup을 진행한다.

```sql
SELECT count(*) FROM pg_stat_activity WHERE usename = 'kosmo_migration';
SELECT count(*) FROM pg_class
WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = 'kosmo_migration');
SELECT count(*) FROM pg_default_acl
WHERE defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'kosmo_migration');
SELECT count(*) FROM pg_database
WHERE datdba = (SELECT oid FROM pg_roles WHERE rolname = 'kosmo_migration');
SELECT count(*) FROM pg_tablespace
WHERE spcowner = (SELECT oid FROM pg_roles WHERE rolname = 'kosmo_migration');
SELECT count(*) FROM pg_shdepend
WHERE refclassid = 'pg_authid'::regclass
  AND refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'kosmo_migration');
SELECT member.rolname AS member, granted.rolname AS granted_role
FROM pg_auth_members
JOIN pg_roles member ON member.oid = pg_auth_members.member
JOIN pg_roles granted ON granted.oid = pg_auth_members.roleid
WHERE member.rolname = 'kosmo_migration' OR granted.rolname = 'kosmo_migration';
```

Preflight 실패 시 owner migration SQL과 wave 2 workload activation을 시작하지 않는다.

### Postflight

- Migration Job의 성공, migration history 식별 정보, CNPG reconciliation과 owner/catalog 상태를 확인한다. Secret 값, password hash와 row 값은 출력하지 않는다.
- 모든 active API·Web·Worker·Fedify workload가 같은 immutable prod digest와 `kosmo_runtime` principal을 사용하는지, owner Secret을 소비하지 않는지 확인한다.
- `kosmo_migration`의 유효 login·owner membership·active session과 migration Vault/VSO consumer가 남아 있지 않은지 확인한다.
- 승인된 sync가 `Prune=confirm` 대기 상태가 되면 `argocd app confirm-deletion <application>` 또는 UI의 Confirm Pruning으로 앞서 확인한 두 리소스만 제거되도록 승인하고 sync 완료를 기다린다. 이 확인은 `prod` Environment 승인을 대체하지 않는다.
- Historical owner ReplicaSet은 controller history로 보존하고 지원되는 rollback 대상에서 제외한다. 재활성화하면 owner credential을 다시 소비할 수 있다는 잔여 위험을 운영 기록에 남긴다.

Postflight에서는 `pg_roles`, `pg_auth_members`, `pg_stat_activity`, `pg_class`, `pg_default_acl`,
`pg_database`, `pg_tablespace`, `pg_shdepend`의
`kosmo_migration` 결과가 모두 비어 있거나 `0`인지 확인하고, CloudNativePG Cluster status에 managed-role
reconciliation error가 없는지 확인한다. Password hash, Secret data와 row payload는 출력하지 않는다.

Postflight 실패 시 release 완료 또는 OpenSpec archive를 주장하지 않고, 기존 workload 유지·새 forward release·승인된 restore 판단을 기존 복구 경계에 따라 수행한다.

## Destructive migration

`memory/database-migrations.md`의 expand → transition → contract 정책은 계속 적용한다. 다만 모든 production release에 generic phase/evidence JSON gate를 적용하지 않는다.

실제 destructive contract migration은 해당 schema migration 이슈·PR·release에서 다음을 구체적으로 정의하고 검증한다.

- Expand/transition/backfill 완료 상태
- Active, preview와 rollback 대상 구버전 workload 호환성
- Rollback 보장 기간 종료
- 필요한 backup/restore evidence와 복구 절차
- 실패 뒤 forward migration 또는 승인된 restore 판단

Contract SQL은 transition image에 미리 포함하지 않는다. 각 단계는 독립 PR과 release로 전달한다.

## 실패와 복구

- Credential 또는 Secret 실패: SQL을 실행하지 않는다. Runtime credential로 우회하지 않는다.
- Advisory lock 실패: 다른 migration을 확인하고 종료된 뒤 원인을 수정한 main PR 또는 승인된 workflow_dispatch target SHA로 새 production release를 재시도한다.
- SQL 또는 timeout 실패: 실패한 migration 파일의 schema와 history를 rollback하고 wave 2 workload 활성화를 중단한다. Drizzle history를 수동 성공 처리하지 않는다.
- 부분 적용: 앞서 성공한 파일의 schema와 history는 유지한다. 자동 down migration이나 database rollback을 실행하지 않고, 원인을 수정한 뒤 workflow_dispatch production release가 이미 적용된 name/hash를 건너뛰고 아직 적용되지 않은 파일만 재시도하거나 새 forward migration을 사용한다.
- Destructive migration의 restore 판단: 해당 schema migration runbook과 [Production PostgreSQL backup과 복구](./postgres-backup.md)를 따른다.

완료 여부와 Drizzle migration count/hash 같은 비민감 식별 정보만 감사 기록에 남긴다. Credential, connection string과 database row 값은 출력하지 않는다.
