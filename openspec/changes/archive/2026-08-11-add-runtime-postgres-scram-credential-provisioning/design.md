## Context

현재 Helm chart는 CloudNativePG Cluster와 기존 PgBouncer 경로를 사용한다. API/Web 기본 연결과 기본 비활성 Worker는 owner kosmo credential을 사용하고, production migration은 kosmo_migration LOGIN으로 접속한 뒤 SET ROLE kosmo로 ownership을 보존한다. PROD-369은 이 경계를 바꾸지 않고 kosmo_api와 kosmo_worker 비소유 LOGIN을 static SCRAM password source와 함께 준비한다.

Role별 Secret은 Vault KV static source를 Vault Secrets Operator(VSO)가 Kubernetes kubernetes.io/basic-auth destination으로 동기화한다. DatabaseRole은 그 destination을 passwordSecret으로 참조하고, CNPG가 role password와 reload lifecycle을 관리한다. API와 Worker Secret은 release prefix와 role 이름으로 분리되어야 하며 password 값 자체는 artifact에 노출하지 않는다.

## Goals / Non-Goals

**Goals:**

- 모든 Helm 환경에 kosmo_api, kosmo_worker LOGIN과 role별 passwordSecret을 선언한다.
- API BYPASSRLS=false, Worker BYPASSRLS=true, 비상승 attributes와 빈 membership을 유지한다.
- role별 VaultStaticSecret이 환경별 정적 KV path에서 username/password만 destination으로 동기화하게 한다.
- 기존 PgBouncer, owner/migration/replication/local/legacy SCRAM과 workload connection 경계를 보존한다.
- static render/lint와 strict OpenSpec 검증에 더해 non-prod live verification을 completion evidence로 기록한다. Production preflight/sync/apply/live는 OpenSpec completion과 분리된 외부 운영 authorization boundary로 둔다.

**Non-Goals:**

- 취소된 PROD-470 client-certificate/direct PostgreSQL, pg_hba, TLS mount/parameter 또는 external CA.
- workload URL/selector, restart, Worker/API principal cutover (PROD-715, PROD-716).
- schema/table/sequence GRANT, default privilege, ownership, RLS policy (PROD-724).
- explicit DB handle 또는 SQL boundary (PROD-710).
- Vault Dynamic Secret (PROD-744) 또는 password value rotation 정책의 신규 설계.
- Production preflight/sync/apply/live와 production access는 이 pass의 범위가 아니다. Dev cluster apply와 실제 Vault/CNPG/role 상태는 이 change의 completion evidence로만 확인한다.

## Implementation Guidance

### Current Constraints

- DatabaseRole passwordSecret.name은 VSO destination Secret 이름과 byte-level로 일치해야 한다. API와 Worker는 각각 `*-postgres-api`, `*-postgres-worker`를 사용한다.
- VSO source path는 Helm .Values.env를 포함한 kubernetes/kosmo/<env>/api-database와 kubernetes/kosmo/<env>/worker-database로 분리한다.
- destination은 kubernetes.io/basic-auth이고 transformation에는 username과 password만 포함한다. cnpg.io/reload: "true" label과 static refreshAfter를 유지한다.
- DatabaseRole은 login: true, inherit: true, superuser/createdb/createrole/replication: false, role별 bypassrls, inRoles: [], databaseRoleReclaimPolicy: retain을 명시한다.
- API/Worker 문서는 독립된 YAML document로 유지한다. 두 role의 BYPASSRLS와 후속 lifecycle이 다르므로 범용 range helper로 속성을 합치지 않는다.
- Role provisioning은 workload selector와 연결되지 않는다. 기존 PgBouncer/direct endpoint, owner/migration Secret 및 existing rollout env는 이 change에서 변경하지 않는다.
- Production sync/apply와 production secret/role data 확인은 명시적 사용자 승인 없이는 수행하지 않는다. Dev live secret/role evidence는 이 change의 completion evidence로 기록한다.

### Recommended Approach

1. postgres-runtime-roles.yaml에서 두 DatabaseRole에 role별 static passwordSecret을 연결한다.
2. vaultstaticsecret.yaml에 API/Worker용 VaultStaticSecret 두 개를 추가해 환경별 static KV path와 basic-auth destination을 선언한다.
3. Helm lint/render에서 dev/prod의 role 이름·attributes·Secret path/name/shape와 owner/migration/PgBouncer 음성 경계를 확인한다.
4. Dev live에서 API/Worker VSO가 Ready이고 basic-auth destination의 type·username/password shape·`cnpg.io/reload: "true"` label, 적용된 DatabaseRole의 attributes 및 membership/ownership 부재, PgBouncer SCRAM `current_user = session_user`, 기존 client-cert Secret 부재와 Rollout/Pooler Healthy를 확인해 completion evidence로 기록한다.
5. Production preflight/sync/apply/live는 별도 운영 authorization이 있을 때만 수행할 수 있는 외부 경계로 남긴다. 이 change의 task·completion·archive는 production 실행을 요구하거나 승인하지 않는다.

### Allowed Alternatives

Role별 VaultStaticSecret을 명시적인 두 YAML document로 쓰거나, 동일한 role 목록을 순회해 같은 필드를 렌더하는 것은 결과 계약이 보존되면 허용한다. 다만 API/Worker destination·path·BYPASSRLS·Secret ownership을 하나로 합치는 abstraction은 허용하지 않는다.

### Known Traps

- disablePassword 또는 clientCertificate.enabled를 passwordSecret과 혼용하지 않는다.
- CNPG generated client certificate Secret, Cluster CA, pg_hba 또는 direct endpoint를 이 change에 추가하지 않는다.
- API Secret을 Worker에 재사용하거나 shared kosmo_runtime Secret을 만들지 않는다.
- VSO destination name을 PostgreSQL role name이나 arbitrary global Secret으로 추론하지 않는다.
- basic-auth destination에 password value를 values/rendered output/OpenSpec/log에 넣지 않는다.
- databaseRoleReclaimPolicy: retain이 Secret data나 VSO source를 retain한다고 설명하지 않는다.
- migration Secret/role, owner kosmo, PgBouncer Service, ACL/RLS와 workload selector를 함께 수정하지 않는다.

## Risks / Trade-offs

- [정적 Secret sync 지연 또는 password mismatch] → destination metadata/shape와 CNPG reload 상태를 dev live evidence에서 확인하고, 후속 rotation이나 환경 변경에서는 같은 검증을 반복한다.
- [동명 role adoption이 기존 attribute/membership에 영향을 줌] → 적용 전 preflight로 role identity와 ownership을 확인하고, 별도 승인 없이는 apply하지 않는다.
- [role provisioning과 workload cutover가 분리되어 일시적으로 새 role이 소비되지 않음] → 의도한 additive 경계다. 후속 cutover issue가 selector와 rollback을 독립적으로 소유한다.
- [static credential을 dynamic으로 오해함] → PROD-744를 후속 범위로 명시하고, 이번 change에서는 KV static source와 VSO basic-auth destination만 다룬다.

## Migration Plan

1. Static DatabaseRole/VSO manifest와 render/lint/strict validation을 완료한다.
2. Dev에 적용된 API/Worker VSO Ready, basic-auth Secret shape와 reload label, DatabaseRole attributes 및 membership/ownership 부재, PgBouncer SCRAM `current_user = session_user`, 이전 client-cert Secret 부재, 기존 Rollout/Pooler Healthy를 non-prod completion evidence로 기록한다.
3. 후속 PROD-724, PROD-710, PROD-715, PROD-716이 각자의 GRANT/handle/cutover를 독립적으로 구현한다.
4. Production preflight/sync/apply/live는 별도 운영 authorization에 따른 외부 절차이며 이 change의 task·completion·archive 단계가 아니다. Completion·merge·archive는 production 실행을 승인하지 않는다.
5. Static validation과 dev live completion evidence를 기준으로 change completion을 판단하고, archive 후 전체 strict validation은 OpenSpec completion policy에 따라 수행한다.

## Open Questions

없음. Static SCRAM provisioning과 후속 범위는 사용자 승인된 Issue Gate에서 결정되었다.
