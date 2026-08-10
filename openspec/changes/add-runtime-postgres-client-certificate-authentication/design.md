## Context

현재 Helm chart의 API/Web와 기본 비활성 Worker는 owner `kosmo` credential을 사용한다. Production migration은 별도 `kosmo_migration` LOGIN으로 접속한 뒤 `SET ROLE kosmo`로 객체 ownership을 보존한다. PROD-369은 이 경계를 건드리지 않고 `kosmo_api`, `kosmo_worker` 역할과 아직 workload가 소비하지 않는 credential만 먼저 준비한다.

현재 dev/prod의 CloudNativePG operator와 live `DatabaseRole` CRD는 1.30.0이다. `DatabaseRole.spec.clientCertificate.enabled`는 역할별 인증서를 Cluster client CA로 서명해 `<databaserole-name>-client-cert` Secret에 저장하고 자동 갱신한다. 생성 Secret에는 `tls.crt`, `tls.key`만 있으며 expiration은 DatabaseRole status에 노출된다. Operator는 `pg_hba`나 workload mount를 자동 변경하지 않는다.

PROD-369과 PROD-470은 역할별 certificate identity와 lifecycle을 함께 결정·검증하므로 하나의 OpenSpec change를 공유한다. 다만 provisioning과 consumption은 독립 배포·rollback 단위이므로 task와 PR 소유권을 분리한다.

## Goals / Non-Goals

**Goals:**

- 모든 Helm 배포 환경에 `kosmo_api`, `kosmo_worker` 비소유 LOGIN을 역할별 CNPG client certificate와 함께 선언한다.
- 두 역할의 password를 명시적으로 `NULL`로 유지하고 Vault password source 의존성을 제거한다.
- API/Worker role attribute, membership, generated Secret 이름·shape, status·expiration과 certificate lifecycle을 검증 가능하게 한다.
- 후속 PROD-470이 선택한 API/Worker 연결만 certificate 인증으로 전환할 수 있는 공통 계약을 제공한다.
- 기존 owner, migration, replication과 local/legacy password·SCRAM 경계를 보존한다.

**Non-Goals:**

- PROD-369 PR에서 `pg_hba`, workload mount, connection parameter, selector consumption이나 restart trigger를 변경하는 것.
- schema/table/sequence GRANT, default privilege 또는 RLS policy.
- owner/migration/replication/local 연결의 certificate 전환.
- Vault PKI issuer, VaultPKISecret 또는 외부 CA 통합.

## Implementation Guidance

### Current Constraints

- `clientCertificate.enabled: true`는 `login: true`를 요구한다.
- password를 단순히 생략하는 대신 `disablePassword: true`를 선언해 기존 role을 adopt할 때도 password를 `NULL`로 reconcile한다. `passwordSecret`과 `disablePassword`는 함께 사용할 수 없다.
- generated Secret 이름은 PostgreSQL `spec.name`이 아니라 DatabaseRole `metadata.name`에서 파생한다. Secret에는 CA가 포함되지 않는다.
- Cluster client CA Secret에 private key가 없으면 CNPG가 인증서를 서명할 수 없고 DatabaseRole status에 이유를 기록한다.
- DatabaseRole을 삭제하면 `databaseRoleReclaimPolicy: retain`이어도 PostgreSQL role만 남고 generated certificate Secret은 owner reference로 삭제된다.
- 기존 role을 adopt하면 누락한 attribute도 기본값으로 되돌리고 `inRoles`에 없는 membership을 revoke한다. 적용 전 동명 역할의 속성·membership·ownership을 확인해야 한다.
- API/Worker manifest는 향후 서로 다른 lifecycle을 가질 수 있으므로 `range`로 결합하지 않고 명시적인 YAML document를 유지한다.
- Production sync/apply는 별도 사용자 승인 없이는 수행하지 않는다.

### Recommended Approach

1. PROD-369에서 기존 두 DatabaseRole의 `passwordSecret`을 제거하고 `disablePassword: true`, `clientCertificate.enabled: true`를 명시한다.
2. PROD-369에서 runtime용 VaultStaticSecret 두 개를 제거하되 기존 공용 env와 production migration VaultStaticSecret은 그대로 둔다.
3. Helm lint/render에서 모든 environment에 두 DatabaseRole만 추가되고 Vault password source, `pg_hba`, workload mount/restart와 selector가 추가되지 않는지 확인한다.
4. 비운영 적용 뒤 DatabaseRole `status.applied`, generated Secret의 `tls.crt`/`tls.key`, certificate expiration, role attribute·membership·password 부재와 object ownership 부재를 민감 정보 없이 검증한다.
5. PROD-470은 별도 PR에서 두 역할 전용 `hostssl ... cert`/non-SSL reject 순서, certificate/Cluster CA mount, atomic selector와 rotation restart를 구현한다. Owner/migration/replication/local 연결은 기존 방식으로 남긴다.
6. shared integration verification이 끝난 뒤에만 change를 archive한다.

### Allowed Alternatives

없음. 사용자 결정으로 Vault password credential과 전체 연결의 일괄 TLS 전환은 선택하지 않았다.

### Known Traps

- PROD-369에서 `pg_hba`, certificate volume/env, rollout restart target 또는 workload selector를 추가하지 않는다.
- generated Secret 이름을 `kosmo_api-client-cert`처럼 PostgreSQL role name에서 추론하지 않는다.
- generated Secret에 `ca.crt`가 있다고 가정하지 않는다.
- `passwordSecret`을 남긴 채 `disablePassword`를 추가하지 않는다.
- `databaseRoleReclaimPolicy: retain`이 generated Secret까지 retain한다고 설명하지 않는다.
- API Rollout에 Worker certificate를 주입하지 않는다.
- migration SQL, GRANT/default privilege 또는 domain RLS policy를 이 change의 provisioning PR에 넣지 않는다.

## Risks / Trade-offs

- [DatabaseRole 삭제 시 generated certificate Secret이 사라진다] → PROD-470 소비 전에는 안전하게 rollback할 수 있다. 소비 뒤 rollback은 workload selector를 먼저 기존 경계로 되돌린 다음 DatabaseRole을 제거한다.
- [Cluster client CA에 signing key가 없을 수 있다] → apply 전 CA Secret metadata/keys를 민감 정보 없이 확인하고, 비운영 status에서 issuance를 검증한다.
- [기존 동명 role이 adopt되며 attribute/password/membership이 바뀐다] → 환경별 preflight로 기존 role과 소비자를 확인한다. 자동으로 덮어써도 된다는 근거가 없으면 적용하지 않는다.
- [Certificate가 발급돼도 접속할 수 없다] → 의도된 Expand 경계다. PROD-470이 `pg_hba`와 workload 소비를 별도 배포한다.

## Migration Plan

1. PROD-369 manifest와 static validation을 완료하되 어떤 환경에도 apply하지 않는다.
2. 비운영 환경의 operator/CRD, client CA signing key와 동명 role을 확인한 뒤 DatabaseRole만 적용한다.
3. generated Secret/status/expiration과 PostgreSQL role 경계를 검증한다.
4. PROD-470에서 선택적 certificate 인증 소비를 구현·검증한다.
5. Production은 각 단계마다 사용자의 별도 명시적 승인 뒤에만 sync/apply한다.

## Open Questions

없음.
