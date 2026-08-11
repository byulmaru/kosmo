## Context

이 기록은 최신 Linear PROD-369와 2026-08-11 사용자 결정에 맞춰 static SCRAM role/credential provisioning만 active contract로 남긴다. 현재 저장소는 CloudNativePG PgBouncer와 role별 VaultStaticSecret/basic-auth Secret을 사용한다. certificate/direct PostgreSQL과 PROD-470 shared change는 취소된 대안으로 아래 Superseded Decisions에 보존한다.

## Decision Records

### API와 Worker database LOGIN을 분리한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-369; 2026-08-11 사용자 결정
- Status: Active
- Context / Problem: API viewer와 trusted federation/Temporal Worker는 RLS bypass와 후속 rollout 경계가 다르다.
- Decision Outcome: API LOGIN은 kosmo_api, Worker LOGIN은 kosmo_worker로 고정한다. API는 BYPASSRLS=false, Worker는 BYPASSRLS=true이고, 둘 다 owner/migration/상대 role membership 없이 non-owner로 provision한다.
- Alternatives Considered: shared kosmo_runtime은 credential과 policy rollout을 결합한다. kosmo_fedify는 현재 Worker principal 계약을 표현하지 못한다.
- Consequences: 두 role은 독립 Secret source와 후속 cutover를 가질 수 있고 이번 change는 workload 전환을 수행하지 않는다.
- Confirmation / Follow-up: Static Helm render에서 role name, attributes와 inRoles를 확인했고, dev applied state에서 같은 attributes와 empty membership·ownership을 확인했다. Production catalog 확인은 이 change의 completion evidence가 아니다.

### Runtime credential은 role별 Vault/VSO static SCRAM Secret을 사용한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-369; 2026-08-11 사용자 결정
- Status: Active
- Context / Problem: 각 runtime role은 기존 CloudNativePG PgBouncer 경로에서 사용할 passwordSecret이 필요하다. 이번 issue는 동적 credential lifecycle을 소유하지 않는다.
- Decision Outcome: API와 Worker DatabaseRole은 각각 release별 `*-postgres-api`, `*-postgres-worker` Secret을 passwordSecret으로 참조한다. VSO VaultStaticSecret은 kubernetes/kosmo/<env>/api-database와 worker-database의 정적 KV source를 Kubernetes basic-auth destination으로 동기화하고 username/password만 포함한다.
- Alternatives Considered: 하나의 shared runtime Secret은 role별 rotation과 rollback을 결합한다. Vault Dynamic Secret은 PROD-744 후속 범위다. Helm random password는 source ownership과 rotation 증거가 없다.
- Consequences: CNPG role password와 VSO destination은 정적으로 provision되며 workload selector/cutover는 별도 issue가 소유한다.
- Confirmation / Follow-up: Helm render에서 source path, destination name/type, transformation과 role passwordSecret 참조를 확인했다. Dev live에서 API/Worker VSO가 Ready이고 role별 basic-auth destination의 username/password shape와 `cnpg.io/reload: "true"` label을 확인했다. Production sync/readiness는 별도 운영 authorization boundary다.

### 기존 PgBouncer와 connection 경계를 보존한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-369; openspec/specs/postgres-session-pool/spec.md; openspec/specs/workload-postgres-credential-selection/spec.md
- Status: Active
- Context / Problem: role provisioning은 additive Expand slice이며 기존 API/Web/Worker와 migration의 endpoint·selector를 바꾸면 후속 cutover rollback과 결합된다.
- Decision Outcome: 기존 CloudNativePG PgBouncer와 direct/owner/migration/replication/local/legacy SCRAM 경계를 유지한다. 이번 change는 workload URL, Secret selector, mount, restart, pg_hba 또는 direct certificate connection을 변경하지 않는다.
- Alternatives Considered: role provision과 동시에 client certificate/direct connection을 활성화하는 선택은 취소된 PROD-470의 범위이고 production/rollback 경계를 넓힌다.
- Consequences: 새 role과 Secret은 일시적으로 workload에서 소비되지 않을 수 있다. PROD-715/716이 principal cutover를 별도로 소유한다.
- Confirmation / Follow-up: Render 음성 경계와 existing manifest diff를 확인했다. Dev PgBouncer SCRAM probe에서 API와 Worker 모두 `current_user = session_user`로 실제 role login을 확인했고 기존 Rollout/Pooler가 Healthy였다. Workload principal cutover와 production 검증은 이 change 범위 밖이다.

### Runtime role은 최소 권한과 retain lifecycle을 선언한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-369
- Status: Active
- Context / Problem: runtime role provisioning과 object access policy·SQL migration은 서로 다른 rollback lifetime을 가진다.
- Decision Outcome: 두 DatabaseRole은 login/ inherit와 role별 bypassrls만 사용하고 superuser, createdb, createrole, replication을 false, inRoles를 empty, databaseRoleReclaimPolicy를 retain으로 선언한다. GRANT/default privilege/ownership/RLS는 이 change에 넣지 않는다.
- Alternatives Considered: role creation과 GRANT를 함께 배포하면 PROD-724의 object privilege 승인과 rollback을 결합한다.
- Consequences: role identity는 보존되지만 object access는 후속 PROD-724와 application boundary가 명시적으로 소유한다.
- Confirmation / Follow-up: Static manifest assertion과 dev applied state를 확인했다. 두 DatabaseRole의 role attributes가 계약과 일치하고 membership·ownership이 없음을 확인했으며, 객체 privilege와 후속 SQL은 별도 이슈가 소유한다.

### Production authorization은 OpenSpec completion과 별도인 외부 경계다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-369; docs/operations/production-migrations.md; memory/database-migrations.md; 사용자 결정
- Status: Active
- Context / Problem: CI와 Helm render만으로는 Secret 값이나 실제 Vault/CNPG role 상태를 증명할 수 없고 production identity 변경은 명시적 승인이 필요하다.
- Decision Outcome: Static validation은 password value를 노출하지 않고 수행하며, dev live evidence를 completion evidence로 기록한다. Production preflight/sync/apply/live는 OpenSpec task·completion·archive criterion이 아닌 외부 운영 authorization boundary다. 사용자의 별도 승인 없이는 실행하지 않으며, completion·merge·archive 어느 것도 production 실행을 승인하지 않는다.
- Alternatives Considered: PR merge 또는 green CI를 production approval로 해석하는 것은 live preflight와 rollback 검토를 건너뛴다.
- Consequences: PROD-369 담당자는 static validation과 dev live evidence로 change completion을 판단하고 archive할 수 있다. Production sync/apply/live는 별도 authorization과 운영 절차로 남는다.
- Confirmation / Follow-up: Strict OpenSpec와 static Helm validation, dev VSO/DatabaseRole/Secret/PgBouncer/rollout evidence를 확인했다. Production authorization은 이 change의 완료 또는 archive에 포함하지 않는다.

## Remaining Decisions

없음. Static SCRAM provisioning과 후속 issue 경계는 사용자 승인으로 확정되었다.

## Superseded Decisions

### Superseded: CNPG role별 client certificate와 disablePassword

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: 이전 active PROD-369/PROD-470 OpenSpec; 취소된 Linear PROD-470; 2026-08-10 사용자 결정
- Status: Superseded
- Previous Outcome: kosmo_api와 kosmo_worker DatabaseRole에 disablePassword: true와 clientCertificate.enabled: true를 사용하고 CNPG generated \*-client-cert Secret을 credential source로 삼는다.
- Superseded By: Active Runtime credential은 role별 Vault/VSO static SCRAM Secret을 사용한다.
- Reason: 현재 contract는 기존 CloudNativePG PgBouncer와 정적 SCRAM passwordSecret/basic-auth Secret을 유지한다. Client-certificate/direct PostgreSQL 방향은 PROD-470에서 취소되었다.
- Consequences: 이 change는 clientCertificate, generated tls.crt/tls.key, Cluster CA 또는 pg_hba를 규범화하지 않는다.

### Superseded: PROD-369과 PROD-470을 하나의 shared certificate-authentication change로 묶음

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: 이전 change add-runtime-postgres-client-certificate-authentication; 취소된 Linear PROD-470
- Status: Superseded
- Previous Outcome: PROD-369이 certificate identity/provisioning을 구현하고 PROD-470이 같은 change에서 pg_hba, certificate mount, connection selector와 rotation restart를 구현하며 shared integration 뒤 archive한다.
- Superseded By: 현재 change는 PROD-369 static SCRAM provisioning만 소유하고 downstream workload cutover·SQL·GRANT는 각 issue가 소유한다.
- Reason: certificate/direct connection 대안이 취소됐고 static role/password provisioning은 독립적으로 승인·rollback할 수 있다.
- Consequences: PROD-470은 active requirement/task provenance가 아니며 history로만 남는다.

### Superseded: shared kosmo_runtime와 Vault PKI 전체 연결 전환

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: 이전 PROD-470 design/decision; 취소된 PROD-470
- Status: Superseded
- Previous Outcome: API와 Worker가 shared kosmo_runtime certificate identity를 사용하고 Vault PKI가 runtime/migration/replication certificate를 발급하며 전체 connection을 TLS로 전환한다.
- Superseded By: API/Worker role별 Vault static SCRAM Secret과 기존 PgBouncer connection 경계를 유지하는 현재 decisions.
- Reason: user authority는 direct PostgreSQL/client certificate를 취소하고 PROD-369 static SCRAM provisioning만 승인했다.
- Consequences: Vault PKI issuer, external CA, migration/replication certificate와 전체 TLS cutover는 이 change에서 다루지 않는다.
