## 1. PROD-369 역할과 client certificate additive provisioning

**Authority / Provenance**

- Linear `PROD-369`
- Shared contract: Linear `PROD-470`
- Downstream: `PROD-724`, `PROD-713`, `PROD-715`, `PROD-716`

**Deliverable**

모든 Helm 배포 환경에 기존 owner workload와 migration 경계를 바꾸지 않는 `kosmo_api`, `kosmo_worker` 비소유 LOGIN과 CNPG 역할별 client certificate를 additive하게 provision한다.

**Guardrails**

- API는 `BYPASSRLS=false`, Worker는 `BYPASSRLS=true`; 두 역할은 password, 상승 권한, owner/migration/상대 membership을 갖지 않는다.
- VaultStaticSecret, Vault password source, `passwordSecret`, workload mount/restart, `pg_hba`, selector consumption을 추가하지 않는다.
- Owner `kosmo`, `kosmo_migration`, replication, local/legacy password·SCRAM, ACL/RLS와 migration manifest를 변경하지 않는다.
- DatabaseRole은 retain하고 production sync/apply는 별도 사용자 승인 전 수행하지 않는다.

- [x] 1.1 기존 runtime VaultStaticSecret/passwordSecret을 제거하고 두 DatabaseRole에 `disablePassword: true`, `clientCertificate.enabled: true`를 선언한다.
- [x] 1.2 모든 environment render에서 두 explicit DatabaseRole의 이름, role attribute, membership, certificate 설정, retain/Prune 경계를 검증한다.
- [x] 1.3 기존 공용 env와 production migration VaultStaticSecret, owner workload, migration identity, replication, selector, `pg_hba`, ACL/RLS manifest가 변경되지 않았음을 검증한다.
- [x] 1.4 Generated Secret 이름이 `<DatabaseRole metadata.name>-client-cert`로 파생되고 `tls.crt`/`tls.key`, status expiration을 CNPG가 소유한다는 계약과 rollback 절차를 문서·검증 assertion에 반영한다.
- [x] 1.5 Helm lint/render, formatting, strict shared OpenSpec validation, diff-check와 self-review를 통과시킨다.
- [x] 1.6 비운영 환경의 operator/CRD, client CA signing key와 동명 role을 확인한 뒤 적용하고 DatabaseRole applied, generated Secret shape/expiration, 실제 role attribute·password·membership·ownership 경계를 검증한다.
- [ ] 1.7 사용자의 별도 명시적 production apply 승인 뒤에만 같은 preflight·sync·live 검증을 수행한다.

## 2. PROD-470 선택적 client certificate authentication 소비

**Authority / Provenance**

- Linear `PROD-470`
- Provisioning dependency: Linear `PROD-369`
- Actual principal cutover: Linear `PROD-715`, `PROD-716`

**Deliverable**

`kosmo_api`와 `kosmo_worker`를 선택한 연결만 CNPG generated client certificate를 사용할 준비가 되고, 기존 owner/migration/replication/local/password 연결은 유지된다.

- [x] 2.1 `kosmo_api`, `kosmo_worker` 전용 `hostssl ... cert`와 non-SSL reject 규칙을 broad SCRAM보다 먼저 선언하고 순서를 검증한다. (Owner: PROD-470)
- [x] 2.2 Generated role certificate와 Cluster CA의 공개 `ca.crt`만 역할·connection별 read-only mount하고 API에 Worker certificate나 CA signing key가 주입되지 않도록 한다. (Owner: PROD-470)
- [x] 2.3 Password와 certificate selector 입력을 atomic하게 검증하고 Postgres.js에 cert/key/CA와 hostname verification을 연결한다. Worker prefix helper의 실제 connection seam 소비와 principal cutover는 PROD-715가 소유한다. (Owner: PROD-470)
- [x] 2.4 Certificate rotation 뒤 expiration/Secret 갱신을 관측하고 해당 consumer만 계획 재시작해 새 process/pool이 key를 읽는 운영 경계를 구현한다. Application hot reload와 restart controller는 추가하지 않는다. (Owner: PROD-470)
- [x] 2.5 Owner, migration, replication, local/test, Pooler와 certificate selector 비활성 경로가 기존 password·SCRAM/direct endpoint 계약을 유지하는지 검증한다. (Owner: PROD-470)
- [ ] 2.6 비운영 환경에서 `pg_hba_file_rules`, CN-role 일치, 선택적 certificate connection과 독립 rollback을 검증한다. Production은 별도 사용자 승인 전 적용하지 않는다. (Owner: PROD-470)
- [ ] 2.7 PROD-369/470 전체 requirement와 integration evidence를 최신 Linear/canonical에 대조하고 모든 task 완료 뒤 shared change를 archive한다. (Owner: PROD-470)
