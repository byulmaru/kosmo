## ADDED Requirements

### Requirement: API와 Worker runtime은 역할별 CNPG client certificate identity를 가진다

**Authority / Provenance:** Linear `PROD-369`. 모든 Helm 배포 환경은 API runtime에 `kosmo_api`, Web trusted federation ingress와 Temporal Worker DB Activity에 `kosmo_worker` LOGIN을 선언적으로 provision해야 한다(MUST). 각 DatabaseRole은 password를 비활성화하고 CNPG client certificate 자동 발급을 활성화해야 한다(MUST). `kosmo_api`는 `BYPASSRLS=false`, `kosmo_worker`는 `BYPASSRLS=true`여야 하며, 두 역할은 owner/migration/상대 membership이나 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION을 가져서는 안 된다(MUST NOT).

#### Scenario: 역할과 certificate issuance를 additive하게 provision함

- **WHEN** 기존 owner workload가 실행 중인 Helm release에 PROD-369 Expand manifest를 적용한다
- **THEN** `kosmo_api`, `kosmo_worker` DatabaseRole이 추가된다
- **AND** 각 역할은 `disablePassword=true`, `clientCertificate.enabled=true`이다
- **AND** 기존 owner와 migration role·credential은 변경되지 않는다

#### Scenario: Generated certificate를 관측함

- **WHEN** CNPG가 DatabaseRole의 client certificate를 reconcile한다
- **THEN** 같은 namespace에 `<DatabaseRole metadata.name>-client-cert` Secret이 생성된다
- **AND** Secret은 `tls.crt`, `tls.key`를 포함한다
- **AND** DatabaseRole status에서 certificate expiration을 관측할 수 있다
- **AND** Helm이나 Vault Secrets Operator는 generated Secret data를 소유하지 않는다

### Requirement: 역할 provisioning은 certificate 소비를 선점하지 않는다

**Authority / Provenance:** Linear `PROD-369`, `PROD-470`. PROD-369 배포는 `pg_hba`, workload certificate mount, connection parameter, selector consumption 또는 restart target을 변경해서는 안 된다(MUST NOT). PROD-470이 이 change의 후속 task로 선택적 certificate 인증 소비를 소유해야 한다(MUST).

#### Scenario: Provisioning만 배포함

- **WHEN** PROD-369 역할/certificate manifest만 배포한다
- **THEN** certificate Secret은 어떤 workload에도 mount되거나 선택되지 않는다
- **AND** API Rollout에는 Worker certificate가 주입되지 않는다
- **AND** 기존 workload는 owner/password 경계로 재시작 없이 계속 동작한다

#### Scenario: Provisioning 선언을 되돌림

- **WHEN** PROD-470 소비 전에 DatabaseRole 선언을 되돌린다
- **THEN** 기존 owner workload와 migration 경계는 영향을 받지 않는다
- **AND** PostgreSQL role은 retain되고 generated certificate Secret은 CNPG owner-reference lifecycle에 따라 제거된다

### Requirement: 선택된 API와 Worker 연결만 certificate 인증을 사용한다

**Authority / Provenance:** Linear `PROD-470`. 시스템은 `kosmo_api`와 `kosmo_worker`를 선택한 연결에만 역할별 `hostssl ... cert` 규칙과 해당 generated certificate/Cluster CA의 공개 `ca.crt`를 연결해야 한다(MUST). Cluster CA signing key를 workload에 projection해서는 안 된다(MUST NOT). Owner `kosmo`, `kosmo_migration`, replication, local/test와 certificate selector를 사용하지 않는 연결의 password·SCRAM 경계를 변경해서는 안 된다(MUST NOT).

#### Scenario: API certificate 연결을 준비함

- **WHEN** API selector가 certificate 인증을 선택한다
- **THEN** API Rollout과 Web BFF 기본 connection은 `kosmo_api` certificate만 받는다
- **AND** API Rollout은 Worker certificate를 받지 않는다

#### Scenario: Worker certificate 연결을 준비함

- **WHEN** Worker selector가 certificate 인증을 선택한다
- **THEN** Web trusted federation connection과 Temporal Worker DB Activity는 `kosmo_worker` certificate만 받는다
- **AND** Web의 기본 API connection과 Worker connection은 certificate path와 parameter를 공유하지 않는다

#### Scenario: 기존 인증 경계를 유지함

- **WHEN** connection이 API/Worker certificate selector를 사용하지 않는다
- **THEN** owner, migration, replication, local/test와 기존 Pooler 인증 방식은 변경되지 않는다

### Requirement: runtime 역할은 객체 privilege를 선점하지 않는다

**Authority / Provenance:** Linear `PROD-369`; downstream `PROD-724`, `PROD-713`. 이 change는 `kosmo_api`, `kosmo_worker`에 schema/table/sequence privilege, default privilege, ownership 또는 grant option을 부여해서는 안 된다(MUST NOT).

#### Scenario: Role provisioning 직후 권한을 확인함

- **WHEN** role과 certificate만 provision한 직후 catalog privilege를 확인한다
- **THEN** 두 runtime 역할에는 이 change가 부여한 객체 privilege나 ownership이 없다
- **AND** 기존 application 객체 owner는 변경되지 않는다

### Requirement: Generated certificate와 실제 role 경계를 민감 정보 없이 검증한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-470`. 배포 검증은 DatabaseRole applied/status, generated Secret key shape와 expiration, 실제 role identity·attribute·membership·password·ownership을 확인해야 하며(MUST), certificate/private key 원문이나 connection string을 로그·PR·Linear artifact에 노출해서는 안 된다(MUST NOT).

#### Scenario: 비운영 provisioning을 검증함

- **WHEN** 비운영 환경에 PROD-369 manifest를 적용한다
- **THEN** 두 DatabaseRole은 applied 상태이고 generated Secret과 expiration을 관측할 수 있다
- **AND** 역할은 password가 없고 선언한 attribute/membership/ownership 경계를 만족한다
- **AND** 이 검증은 production apply 승인을 의미하지 않는다

#### Scenario: 선택적 certificate connection을 검증함

- **WHEN** PROD-470의 비운영 certificate connection을 검증한다
- **THEN** 인증서 CN과 `current_user`가 선택한 역할과 일치한다
- **AND** `pg_hba` first-match와 non-SSL 거부가 적용된다
- **AND** 다른 역할의 certificate나 일부 certificate 입력은 연결 전에 거부된다

### Requirement: 갱신된 certificate는 대상 workload의 계획 재시작으로 반영한다

**Authority / Provenance:** Linear `PROD-470`; 2026-08-10 사용자 결정. CNPG가 generated certificate Secret을 갱신한 뒤 시스템은 expiration과 Secret 갱신을 관측하고 만료 전에 해당 certificate를 소비하는 workload만 계획 재시작해야 한다(MUST). 이 change는 application pool hot reload나 새 restart controller를 추가해서는 안 된다(MUST NOT).

#### Scenario: API certificate만 갱신됨

- **WHEN** CNPG가 `kosmo_api` certificate를 갱신한다
- **THEN** 운영자는 expiration과 Secret 갱신을 확인한 뒤 API certificate를 소비하는 API Rollout과 Web BFF만 계획 재시작한다
- **AND** Worker 전용 workload와 migration은 재시작하지 않는다

#### Scenario: 계획 재시작 뒤 새 certificate를 확인함

- **WHEN** 대상 workload가 계획 재시작되어 새 process와 pool을 생성한다
- **THEN** 새 connection은 갱신된 key와 CA를 읽는다
- **AND** certificate CN과 `current_user`가 선택한 역할과 일치한다
- **AND** 검증 로그에는 certificate나 private key 원문이 포함되지 않는다

### Requirement: Production apply는 별도 수동 승인을 요구한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-470`; 2026-08-10 사용자 결정. PR merge, manifest 준비 또는 CI 통과는 production sync/apply를 승인하지 않으며(MUST NOT), 운영자는 각 단계의 preflight와 rollback 절차를 확인하고 사용자의 별도 명시적 승인을 받아야 한다(MUST).

#### Scenario: 승인 없이 manifest가 준비됨

- **WHEN** PR과 Helm manifest가 검증됐지만 production apply에 대한 별도 승인이 없다
- **THEN** production에 DatabaseRole, certificate 인증 규칙 또는 workload mount를 적용하지 않는다
- **AND** 기존 production owner workload와 migration 경계만 유지한다

#### Scenario: 승인 뒤 단계별로 적용함

- **WHEN** 사용자가 특정 provisioning 또는 consumption 단계의 production apply를 명시적으로 승인한다
- **THEN** 승인된 release와 범위만 적용하고 즉시 해당 role/certificate/auth 경계를 검증한다
- **AND** 다음 단계는 별도 승인 없이 자동 적용하지 않는다
