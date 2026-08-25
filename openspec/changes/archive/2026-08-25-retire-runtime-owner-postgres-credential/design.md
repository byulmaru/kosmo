## Context

현재 dev migration Job은 CNPG-generated `<cluster>-app` Secret으로 `kosmo`에 직접 연결하지만 production Job은 Vault/VSO가 만든 `<release>-postgres-migration` Secret으로 `kosmo_migration`에 연결한 뒤 `DATABASE_MIGRATION_ROLE=kosmo`를 사용한다. `kosmo_migration` DatabaseRole은 `kosmo` membership과 `databaseRoleReclaimPolicy: retain`을 가지므로 manifest만 삭제하면 PostgreSQL login이 남는다.

Production active application workload는 이미 `kosmo_runtime`을 사용하고 owner connection은 없다. 다만 controller가 보존한 replicas=0 historical ReplicaSet 일부는 owner SecretRef를 계속 포함하며, owner login을 유지하는 이번 설계에서는 재활성화 시 owner 연결이 가능하다.

CloudNativePG 1.30.0 운영 CRD는 Cluster inline managed role의 `ensure: absent`를 server-side dry-run에서 수용한다. Cluster inline role declaration은 같은 role의 DatabaseRole보다 우선하므로 obsolete role을 declarative하게 제거하고 재생성을 막는 데 사용할 수 있다.

## Goals / Non-Goals

**Goals:**

- Dev와 production migration credential 경계를 CNPG-managed owner 직접 로그인으로 통합한다.
- Active runtime과 migration credential consumer를 분리한다.
- 중복된 `kosmo_migration` DatabaseRole, membership과 Vault/VSO credential 경로를 안전하게 제거한다.
- Production 변경 전후 principal, connection, backup과 workload evidence를 남긴다.

**Non-Goals:**

- Owner `kosmo`를 `NOLOGIN` 또는 NULL password로 바꾸지 않는다.
- Historical ReplicaSet, legacy API/Worker role 또는 CNPG-generated application-user Secret을 삭제하지 않는다.
- Runtime ACL, Fedify queue credential 또는 application 동작을 바꾸지 않는다.

## Implementation Guidance

### Current Constraints

- Migration Job의 dev/prod 분기가 credential과 role transition을 동시에 갈라 놓고 있어 credential만 바꾸면 production runner에 불필요한 `SET ROLE` 입력이 남는다.
- Production migration VaultStaticSecret과 DatabaseRole에는 Argo CD prune confirmation이 있으며, 단순 파일 삭제만으로 DB role 제거를 증명할 수 없다.
- `databaseRoleReclaimPolicy: retain` 때문에 DatabaseRole prune은 `kosmo_migration` PostgreSQL role과 password hash를 보존한다.
- Owner 직접 연결 전환보다 role/Secret cleanup이 먼저 적용되면 production migration이 시작되지 못한다.
- Historical owner ReplicaSet은 현재 consumer가 아니지만 owner credential이 계속 유효하므로 fail-closed rollback evidence가 아니다.

### Recommended Approach

1. Migration Job의 환경별 credential 분기를 제거하고 dev/prod 모두 `PGUSER=kosmo`, `<cluster>-app` Secret `password`, 고정 rw Service/database를 사용하게 한다. `DATABASE_MIGRATION_ROLE`은 제거한다.
2. Helm contract tests에서 migration만 owner Secret을 소비하고 active application/queue workload는 기존 runtime/queue credential을 유지하는지 검증한다.
3. `kosmo_migration`을 Cluster inline managed role의 `ensure: absent`로 선언한다. 동시에 기존 DatabaseRole manifest와 migration-database VaultStaticSecret을 제거한다. Cluster declaration의 우선순위로 role 재생성을 막고 CNPG status와 catalog에서 실제 부재를 확인한다.
4. Dev에서 owner migration, pending/no-op migration, runtime readiness와 obsolete role cleanup을 검증한다.
5. Production은 backup/WAL과 active principal preflight 뒤 별도 승인으로 적용한다. Owner migration 성공, active runtime principal 유지, `kosmo_migration` 부재와 CNPG reconciliation 성공을 확인한 뒤 외부 Vault migration credential source를 정리한다.
6. 운영 문서, canonical specs와 database migration memory를 owner 직접 로그인 계약으로 동기화한다.

### Allowed Alternatives

- `databaseRoleReclaimPolicy: delete`를 먼저 배포하고 다음 배포에서 DatabaseRole을 prune하는 2단계 제거도 허용할 수 있다. 다만 각 단계의 실제 role 상태를 검증하고 한 번의 sync에서 retain 상태로 prune되지 않음을 증명해야 한다.
- Inline `ensure: absent` 대신 승인된 관리자 작업으로 role을 drop할 수 있으나, desired state가 재생성을 막고 같은 preflight/postflight 증거를 제공해야 한다.

### Known Traps

- DatabaseRole/VaultStaticSecret 파일만 삭제하고 `kosmo_migration` login 제거를 주장하면 안 된다.
- Owner Secret 이름을 values 입력으로 열거나 runtime credential fallback을 추가하면 안 된다.
- Secret 값, password hash 또는 Vault payload를 test output·OpenSpec·운영 기록에 노출하면 안 된다.
- replicas=0 historical owner ReplicaSet을 fail-closed라고 기록하면 안 된다.
- Role cleanup 실패를 무시한 채 production 완료나 OpenSpec archive를 주장하면 안 된다.

## Risks / Trade-offs

- [Owner credential 하나가 migration의 직접 고권한 credential이 됨] → Secret consumer를 migration Job으로 제한하고 runtime manifest/catalog connection 검증을 release gate에 둔다.
- [Historical ReplicaSet 재활성화 시 owner 연결 복원 가능] → 지원되는 rollback 대상에서 제외하고 잔여 위험을 기록하며 controller GC를 기다린다.
- [`ensure: absent` reconciliation이 dependency 또는 session 때문에 실패] → 사전 dependency/session 조회와 CNPG managed role status·catalog postflight를 요구하고 실패 시 cleanup 완료를 선언하지 않는다.
- [Owner 전환과 obsolete credential cleanup 사이 partial state] → dev 검증과 production preflight owner direct-connection probe를 먼저 통과시키고, 정확한 Argo prune 대상 확인을 별도 승인 단계로 둔다.
- [Rollback 뒤 migration credential 복구가 필요] → 외부 Vault source 삭제 전까지 이전 DatabaseRole/VSO manifest 복원 가능성을 유지하고, source 삭제 뒤 rollback은 새 credential 발급을 요구한다고 기록한다.

## Migration Plan

1. Dev/prod Helm render와 contract test를 owner migration 계약으로 갱신한다.
2. Dev에 owner migration consumer를 적용하고 migration 성공, active runtime credential, owner ownership을 확인한다.
3. Dev `kosmo_migration` role/VSO 경로를 제거하고 CNPG reconciliation 및 catalog 부재를 확인한다.
4. Production preflight에서 backup/WAL, current active connections, owner ownership, generated owner credential의 read-only 직접 연결, `kosmo_migration` dependency와 workload readiness를 기록한다.
5. 별도 승인 뒤 production migration Job을 owner credential로 전환하고 성공을 확인한다.
6. `kosmo_migration` inline `ensure: absent`, DatabaseRole/VSO prune을 적용하고 catalog·CNPG status·active workload를 검증한다.
7. Production postflight 뒤 다음 scheduled backup 완료와 그 이후 WAL archive 정상을 확인한 다음 외부 Vault migration source를 제거하고 최종 evidence를 기록한다.

Rollback은 cleanup 전에는 이전 migration manifest로 되돌린다. Database role이 이미 제거됐지만 Vault source가 남아 있으면 이전 DatabaseRole/VSO를 복원해 CNPG가 role과 credential을 재생성하게 한다. Vault source까지 제거된 뒤에는 새 credential 발급 없이는 이전 경계로 rollback할 수 없다.

## Open Questions

없음.
