## Context

이 기록은 `PROD-712`의 최종 Issue Gate, application runtime의 `kosmo_runtime` 전환 상태, dev/production migration credential 드리프트와 CloudNativePG 1.30.0 role lifecycle 제약을 반영한다. Owner `NOLOGIN` 대신 migration owner 직접 로그인을 선택한 사용자 결정과 그에 따른 historical revision 잔여 위험, obsolete migration identity cleanup 방식을 구현 전에 고정한다.

## Decision Records

### 모든 환경의 migration은 CNPG-managed owner credential을 직접 사용한다

- Decision Date: 2026-08-24
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-712`
- Status: Active
- Context / Problem: Dev는 owner에 직접 연결하고 production은 `kosmo_migration → SET ROLE kosmo`를 사용해 같은 schema migration에 두 고권한 identity와 credential 경로가 존재한다.
- Decision Outcome: Dev와 production migration 모두 CNPG-generated application-user Secret으로 `kosmo`에 직접 연결한다. Owner는 `LOGIN`과 유효 password를 유지하며 별도 role transition은 제거한다.
- Alternatives Considered: `kosmo_migration` 전용 login 유지, owner `NOLOGIN`·NULL password 전환. 별도 login도 owner membership으로 같은 권한을 행사하고 중복 credential을 유지하므로 선택하지 않았다.
- Consequences: `kosmo` 직접 login은 migration의 의도된 권한 경계가 된다. Production migration spec·문서·tests를 변경하고 `DATABASE_MIGRATION_ROLE`을 제거해야 한다.
- Confirmation / Follow-up: Dev/prod rendered Job의 `PGUSER`, SecretRef와 role-transition env 부재를 검증하고 실제 migration의 `session_user=current_user=kosmo`를 비밀값 없이 확인한다.

### Active runtime은 owner credential을 소비하지 않는다

- Decision Date: 2026-08-24
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-712`, `PROD-780`
- Status: Active
- Context / Problem: Owner login을 유지하면 credential consumer 제한이 runtime과 migration의 실질적인 보안 경계가 된다.
- Decision Outcome: Owner Secret consumer는 migration Job으로 제한하고 API/Web/Worker/Fedify application consumer는 `kosmo_runtime`, Fedify MessageQueue는 전용 credential을 유지한다.
- Alternatives Considered: Owner credential을 runtime에도 유지, runtime credential fallback. Owner 우회 경로를 복원하고 실패 차단을 약화하므로 선택하지 않았다.
- Consequences: Workload template과 live connection principal 검증이 release gate가 된다. Secret 값은 어떤 검증 산출물에도 노출하지 않는다.
- Confirmation / Follow-up: Helm contract replay와 production `pg_stat_activity` principal 집계로 active owner connection이 migration 외에 없음을 확인한다.

### Historical owner revision 재활성화 가능성을 잔여 위험으로 유지한다

- Decision Date: 2026-08-24
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-release.md`, Linear `PROD-712`
- Status: Active
- Context / Problem: replicas=0 historical ReplicaSet 일부는 owner SecretRef를 가지며 owner login을 유지하면 재활성화 시 최신 Secret으로 연결할 수 있다.
- Decision Outcome: Historical ReplicaSet을 수동 삭제하거나 revision history를 축소하지 않는다. 해당 revision은 지원되는 rollback 대상에서 제외하고 controller GC 전 재활성화 가능성을 명시적 잔여 위험으로 기록한다.
- Alternatives Considered: Historical ReplicaSet 삭제, owner `NOLOGIN`으로 fail-closed 처리. 사용자는 controller-retained history 삭제를 원하지 않았고 최종 migration owner 직접 로그인과 `NOLOGIN`은 양립하지 않아 선택하지 않았다.
- Consequences: 이 변경은 모든 잠재 owner consumer 객체의 제거를 주장할 수 없고 current active runtime consumer 제거만 보장한다.
- Confirmation / Follow-up: Production evidence에 replicas=0 owner revision 목록, 지원 외 상태와 재활성화 위험을 남긴다.

### Obsolete migration role은 CNPG inline ensure absent로 제거한다

- Decision Date: 2026-08-24
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-712`
- Status: Active
- Context / Problem: 기존 DatabaseRole은 `databaseRoleReclaimPolicy: retain`이므로 manifest prune만으로 `kosmo_migration` role·password hash·membership이 제거되지 않는다.
- Decision Outcome: Cluster inline managed role에 `kosmo_migration ensure: absent`를 선언하고 기존 DatabaseRole과 migration VaultStaticSecret을 제거한다. Cluster inline declaration의 우선순위로 DatabaseRole과의 전환 중 재생성을 막는다.
- Alternatives Considered: DatabaseRole 파일만 삭제, reclaim policy를 먼저 `delete`로 바꾸는 2단계 배포, 수동 관리자 `DROP ROLE`. 단순 삭제는 login을 남기고, 나머지는 같은 결과를 더 많은 운영 단계로 달성하므로 기본 경로로 선택하지 않았다.
- Consequences: CNPG managed role reconciliation status와 실제 catalog 부재가 완료 증거다. Dependency 또는 active session으로 drop이 실패하면 cleanup은 미완료다.
- Confirmation / Follow-up: 운영 CNPG 1.30.0 CRD 대상 server-side dry-run에서 `managed.roles[name=kosmo_migration, ensure=absent]` 수용을 확인했다. 구현 후 dev와 production에서 status·catalog를 다시 검증한다.

### Dev 검증, production cleanup과 외부 credential source 제거를 단계화한다

- Decision Date: 2026-08-24
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-release.md`, `docs/operations/postgres-backup.md`, Linear `PROD-712`
- Status: Active
- Context / Problem: Owner migration 전환, DatabaseRole/VSO cleanup과 외부 Vault source 삭제를 production에서 한 번에 수행하면 부분 실패 시 이전 migration 경계 복구가 어렵다.
- Decision Outcome: Dev에서 owner migration과 obsolete role cleanup을 먼저 적용·검증한다. Production preflight에서도 generated owner credential의 read-only 직접 연결을 검증한다. 별도 승인된 production release는 owner migration Job과 desired-state cleanup을 함께 전달하되 Argo CD가 `Prune=confirm`으로 보호하는 기존 DatabaseRole/VaultStaticSecret은 정확한 대상 확인 뒤 별도로 prune 승인한다. Production postflight 뒤 다음 scheduled backup 완료와 후속 WAL archive 정상을 확인한 다음 외부 Vault source를 제거한다.
- Alternatives Considered: Production sync 전에 DatabaseRole reclaim policy를 바꾸는 2단계 release, production release와 동시에 외부 Vault source까지 삭제. 전자는 같은 최종 상태에 별도 release를 추가하고, 후자는 rollback 증거와 실패 격리를 약화하므로 선택하지 않았다.
- Consequences: Dev evidence와 production owner direct-connection probe가 production 승인 선행 조건이다. Production sync는 prune 확인 전까지 완료되지 않으며, 다음 scheduled backup까지 archive를 완료할 수 없다. Vault source 삭제 뒤 이전 경계 rollback은 새 credential 발급이 필요하다.
- Confirmation / Follow-up: Dev와 production에서 migration 성공, CNPG/catalog state, active runtime readiness와 backup/WAL을 기록한다. Production에서는 `kosmo-postgres-migration` DatabaseRole과 `migration-database` VaultStaticSecret만 prune 대상인지 확인한 뒤 승인한다. Postflight 뒤 최초 scheduled backup 성공과 그 이후 WAL archive 성공을 확인해야 external Vault cleanup과 archive를 진행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-24의 `kosmo_migration → SET ROLE kosmo` 유지 및 owner `NOLOGIN`·NULL password 전환 결정은 최종 Linear `PROD-712` 계약의 CNPG-managed owner 직접 로그인으로 대체됐다. Owner Secret 객체의 지속성보다 별도 고권한 identity 제거와 환경 간 migration 경계 통합을 우선하기로 사용자가 변경했다.
- Historical owner ReplicaSet이 owner Secret 제거 뒤 fail-closed한다는 이전 판단은 owner login 유지 결정으로 더 이상 성립하지 않는다. 최종 계약은 재활성화 가능성을 잔여 위험으로 기록한다.
