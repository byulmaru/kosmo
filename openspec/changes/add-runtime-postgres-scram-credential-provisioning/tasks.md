# Tasks

## 1. PROD-369 static SCRAM role and credential provisioning

**Authority / Provenance**

- Linear PROD-369
- Existing connection contracts: openspec/specs/postgres-session-pool/spec.md, openspec/specs/workload-postgres-credential-selection/spec.md

**Deliverable**

모든 Helm 배포 환경에 기존 CloudNativePG PgBouncer와 owner/migration 경계를 바꾸지 않는 kosmo_api/kosmo_worker LOGIN과 role별 Vault/VSO static SCRAM Secret을 additive하게 provision한다.

**Guardrails**

- API는 BYPASSRLS=false, Worker는 BYPASSRLS=true이고 두 role은 non-owner, non-superuser, non-createdb, non-createrole, non-replication, empty inRoles여야 한다.
- DatabaseRole은 role별 `*-postgres-api`/`*-postgres-worker` basic-auth Secret을 passwordSecret으로 참조하고 databaseRoleReclaimPolicy: retain을 유지한다.
- API/Worker VaultStaticSecret은 kubernetes/kosmo/<env>/api-database와 worker-database를 각각 사용하고 username/password만 destination으로 동기화한다.
- disablePassword, clientCertificate, generated certificate/CA, pg_hba, direct endpoint, workload mount/restart/selector를 추가하지 않는다.
- 기존 공용 env와 production migration Secret, owner kosmo, replication, PgBouncer/direct endpoint, ACL/RLS와 migration manifest는 변경하지 않는다.
- PROD-724 GRANT, PROD-710 handle/SQL, PROD-715/716 cutover와 PROD-744 dynamic secret은 구현·검증하지 않는다.
- Password values와 connection strings를 values, rendered output, logs, OpenSpec 또는 Linear artifact에 기록하지 않는다.

**Verification**

- dev/prod render에서 두 DatabaseRole의 role name, attributes, membership, passwordSecret name과 retain policy를 확인한다.
- dev/prod render에서 두 VaultStaticSecret의 source path, destination name/type, transformation, reload label과 공용/migration 음성 경계를 확인한다.
- Helm lint/format과 target/전체 strict OpenSpec validation, 변경 diff/self-review를 실행한다.
- Non-prod apply와 실제 Vault/CNPG/role 상태 확인은 별도 live gate로 남기고 이 pass에서 완료로 주장하지 않는다.

- [x] 1.1 DatabaseRole에 kosmo_api/kosmo_worker와 role별 passwordSecret, role attributes, empty membership, retain policy를 선언한다.
- [x] 1.2 API/Worker VaultStaticSecret과 정적 KV path, basic-auth destination, username/password transformation을 선언한다.
- [x] 1.3 기존 owner/migration/PgBouncer/workload connection과 후속 GRANT/handle/cutover 범위를 변경하지 않는 음성 경계를 문서화한다.
- [x] 1.4 변경된 static contract에 대한 OpenSpec artifacts와 static validation 절차를 정렬한다.
- [ ] 1.5 Non-prod 환경에서 VaultStaticSecret destination, DatabaseRole applied/password readiness와 실제 role attribute·membership·ownership을 검증한다. (이 pass에서는 미실행)
- [ ] 1.6 사용자의 별도 production apply 승인을 받은 뒤에만 production preflight, sync/apply와 live role/credential 검증을 수행한다. (이 pass에서는 미실행)

## 2. Contract completion and archive gate

**Authority / Provenance**

- Linear PROD-369
- Completion policy: memory/issue-openspec-workflow.md

**Deliverable**

Static SCRAM provisioning contract와 구현 diff가 최신 authority에 일치하고, live evidence가 확보된 뒤에만 change를 archive할 수 있도록 남은 gate와 ownership을 명시한다.

**Guardrails**

- Strict OpenSpec validation 또는 PR/CI 성공만으로 non-prod live, production apply, 실제 Vault/role checks를 완료 처리하지 않는다.
- PROD-470 client-certificate/direct connection history는 decisions.md의 Superseded 기록에만 남기고 active spec/task 근거로 재사용하지 않는다.
- PROD-724, PROD-710, PROD-715, PROD-716, PROD-744를 이 change의 task로 흡수하지 않는다.

**Verification**

- 최신 Linear PROD-369와 canonical 운영 문서를 독립 대조한다.
- live tasks가 완료되기 전에는 archive하지 않고, 완료 후 active spec 동기화와 archive 후 전체 strict validation을 별도 담당자가 수행한다.

- [x] 2.1 Proposal, capability spec, design, decisions와 tasks를 static SCRAM provisioning 범위로 정렬하고 Superseded history를 보존한다.
- [x] 2.2 target change strict validation과 전체 OpenSpec strict validation을 통과시킨다.
- [ ] 2.3 Non-prod live evidence와 production approval/live evidence를 확보한 뒤 completion/archive gate를 재평가한다.
