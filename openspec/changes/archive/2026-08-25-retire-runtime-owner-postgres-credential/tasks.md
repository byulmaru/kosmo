## 1. PROD-712 Migration owner credential 통합

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- Linear `PROD-712`, `PROD-780`

**Deliverable**

Dev와 production migration Job이 같은 release의 CNPG-managed owner credential로 직접 연결하고 환경별 identity 드리프트가 없다.

**Guardrails**

- Owner Secret 이름, rw Service와 database는 release에서 결정되며 임의 values 입력으로 열지 않는다.
- Migration 실패 시 runtime, legacy application 또는 Fedify queue credential로 fallback하지 않는다.
- Active application workload와 queue workload의 기존 credential 경계를 변경하지 않는다.

**Verification**

- Dev/prod Helm render에서 migration의 `PGUSER=kosmo`, `<cluster>-app` password SecretRef와 `DATABASE_MIGRATION_ROLE` 부재를 확인한다.
- Active workload render가 `kosmo_runtime`, queue 전용 credential을 계속 사용하는지 확인한다.

- [x] 1.1 Dev와 production migration credential/identity 경계를 CNPG-generated owner 직접 연결로 통합한다.
- [x] 1.2 별도 migration role transition과 runtime credential fallback 가능성을 제거한다.
- [x] 1.3 Dev/prod migration 및 active workload credential contract 검증을 추가·갱신하고 통과시킨다.

## 2. PROD-712 Obsolete migration identity 제거

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`
- Linear `PROD-712`

**Deliverable**

`kosmo_migration` DatabaseRole, owner membership, Vault/VSO credential consumer와 유효 login path가 desired state와 database에서 제거된다.

**Guardrails**

- `databaseRoleReclaimPolicy: retain` 상태의 manifest prune만으로 database role 제거를 주장하지 않는다.
- Active session, owned object 또는 필요한 dependency가 있으면 destructive cleanup을 중단한다.
- Owner `kosmo`, `kosmo_runtime`, Fedify queue와 legacy role의 기존 책임은 보존한다.

**Verification**

- Helm render에 `kosmo_migration` DatabaseRole, migration-database VaultStaticSecret, migration destination SecretRef가 없는지 확인한다.
- CNPG managed role reconciliation status와 PostgreSQL catalog에서 `kosmo_migration` 부재를 확인한다.
- Secret 값, password hash와 Vault payload를 출력하지 않는다.

- [x] 2.1 CNPG inline `ensure: absent`로 obsolete `kosmo_migration` role의 제거와 재생성 방지를 선언한다.
- [x] 2.2 기존 migration DatabaseRole과 Vault/VSO credential provisioning을 desired manifest에서 제거한다.
- [x] 2.3 Role dependency/session preflight와 CNPG/catalog postflight 검증을 준비하고 focused checks를 통과시킨다.

## 3. PROD-712 Canonical contract와 운영 문서 동기화

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/operations/production-migrations.md`
- `docs/operations/production-release.md`
- `docs/operations/postgres-backup.md`
- `docs/operations/postgres-session-pool.md`
- `memory/database-migrations.md`
- `memory/script.md`
- Linear `PROD-712`

**Deliverable**

Repository 문서와 database migration memory가 owner 직접 로그인, runtime 비소비, obsolete identity cleanup과 잔여 위험을 일관되게 설명한다.

**Guardrails**

- Production 승인, immutable release, migration-before-workload와 backup/recovery gate는 유지한다.
- Historical owner ReplicaSet을 fail-closed 또는 지원되는 rollback 대상으로 표현하지 않는다.
- Owner `NOLOGIN` 또는 NULL password 완료를 주장하지 않는다.

**Verification**

- Canonical 문서, memory와 OpenSpec delta 간 identity·credential·rollback 표현을 대조한다.
- Strict OpenSpec validation과 관련 문서 검증을 통과시킨다.

- [x] 3.1 Production migration·session pool 운영 문서와 database/script memory를 최종 credential 경계로 갱신한다.
- [x] 3.2 Release/backup 절차에 production 전환 preflight·postflight와 historical revision 잔여 위험을 반영한다.
- [x] 3.3 OpenSpec strict validation과 관련 repository checks를 통과시킨다.

## 4. PROD-712 Dev 통합 검증

**Authority / Provenance**

- `docs/operations/production-migrations.md`
- Linear `PROD-712`

**Deliverable**

비운영 환경에서 owner migration과 obsolete identity cleanup이 application runtime을 깨뜨리지 않는다는 실행 증거가 있다.

**Guardrails**

- Production state를 비운영 검증에 사용하거나 변경하지 않는다.
- Migration history를 재작성하거나 이미 적용된 migration을 임의 재실행하지 않는다.
- 검증 결과에 credential 값 또는 row payload를 기록하지 않는다.

**Verification**

- Dev migration 성공/no-op, owner ownership, `kosmo_migration` 부재, active workload readiness와 principal을 확인한다.
- CNPG reconciliation error와 관련 application error가 없는지 확인한다.

- [x] 4.1 Dev 적용 전 principal·role dependency·migration history와 workload baseline을 수집한다.
- [x] 4.2 Dev owner migration 전환을 적용하고 정확한 `Prune=confirm` 대상만 승인해 obsolete role cleanup과 migration 실행을 검증한다.
- [x] 4.3 Dev CNPG/catalog state, active runtime principal과 workload readiness를 기록한다.

## 5. PROD-712 Production 승인 전환과 최종 evidence

**Authority / Provenance**

- `docs/operations/production-release.md`
- `docs/operations/postgres-backup.md`
- Linear `PROD-712`

**Deliverable**

별도 승인된 production 전환이 owner migration 경계로 완료되고 obsolete login path가 제거됐다는 live evidence가 있다.

**Guardrails**

- 최신 backup/WAL, active owner connection drain과 workload readiness가 확인되지 않으면 적용하지 않는다.
- 별도 production 승인 전에는 credential consumer, role 또는 Vault source를 변경하지 않는다.
- replicas=0 historical owner ReplicaSet은 삭제하지 않고 재활성화 잔여 위험을 기록한다.
- External Vault source는 owner migration과 role cleanup postflight 뒤 다음 scheduled backup 완료와 후속 WAL archive 정상을 확인한 다음 별도 단계에서 제거한다.

**Verification**

- 전환 전후 migration 성공, principal/role catalog, CNPG status, active connection과 workload readiness를 확인한다.
- Backup/WAL 상태, historical revision 목록, 지원 가능한 rollback 범위와 Vault source cleanup 시점을 기록한다.

- [x] 5.1 Production preflight evidence를 갱신하고 credential/role 변경에 대한 명시 승인을 받는다.
- [x] 5.2 승인된 owner migration 전환을 적용하고 migration 성공 및 active runtime 경계를 검증한다.
- [x] 5.3 정확한 `Prune=confirm` 대상을 별도 확인·승인해 obsolete `kosmo_migration` role/VSO 경로를 제거하고 CNPG/catalog postflight를 완료한다.
- [x] 5.4 Production postflight 뒤 다음 scheduled backup과 후속 WAL archive 정상을 확인한 다음 external Vault migration source를 제거하고 rollback 경계와 최종 evidence를 기록한다.
