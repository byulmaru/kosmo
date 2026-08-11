# runtime-postgres-scram-credential-provisioning Specification

## Purpose

API와 Worker 비소유 PostgreSQL LOGIN 및 role별 Vault/VSO static SCRAM credential을 기존 CloudNativePG PgBouncer 경계와 함께 additive하게 provision하는 계약을 정의한다. Workload principal cutover, 객체 권한과 production 운영 authorization은 이 capability의 계약에 포함하지 않는다.

## Requirements

### Requirement: API와 Worker runtime role을 static SCRAM credential로 provision한다

**Authority / Provenance:** Linear PROD-369. 모든 Helm 배포 환경은 API용 kosmo_api와 Worker용 kosmo_worker LOGIN을 각각 하나의 CloudNativePG DatabaseRole로 선언해야 한다(MUST). 두 역할은 기존 PostgreSQL PgBouncer 경로에서 사용할 role별 passwordSecret을 가져야 한다(MUST). kosmo_api는 BYPASSRLS=false, kosmo_worker는 BYPASSRLS=true여야 하며, 두 역할은 SUPERUSER, CREATEDB, CREATEROLE, REPLICATION이 아니고 inRoles가 비어 있어야 한다(MUST NOT).

#### Scenario: 모든 환경에 role과 passwordSecret을 additive하게 렌더함

- **WHEN** 기존 owner workload가 실행 중인 dev 또는 prod Helm release를 렌더한다
- **THEN** release별 `*-postgres-api`와 `*-postgres-worker` DatabaseRole이 나타난다
- **AND** DatabaseRole의 PostgreSQL role name은 각각 kosmo_api와 kosmo_worker이다
- **AND** API에는 bypassrls: false, Worker에는 bypassrls: true, 양쪽에는 login: true, inRoles: []와 비상승 role attribute가 선언된다
- **AND** 각 DatabaseRole의 passwordSecret.name은 같은 release의 role별 basic-auth Secret을 가리킨다
- **AND** 기존 owner/migration role과 workload manifest는 이 추가만으로 변경되지 않는다

#### Scenario: 역할별 static SCRAM source를 CNPG에 연결함

- **WHEN** DatabaseRole이 reconcile될 수 있는 manifest를 검토한다
- **THEN** passwordSecret은 role별 VSO destination Secret(`*-postgres-api` 또는 `*-postgres-worker`)을 참조한다
- **AND** disablePassword나 clientCertificate 설정은 나타나지 않는다
- **AND** 두 role은 owner, migration 또는 서로의 membership을 선언하지 않는다

### Requirement: role별 VaultStaticSecret이 basic-auth password source를 소유한다

**Authority / Provenance:** Linear PROD-369. 모든 Helm 배포 환경은 API와 Worker에 독립된 VaultStaticSecret을 렌더해야 한다(MUST). API source는 kubernetes/kosmo/<env>/api-database, Worker source는 kubernetes/kosmo/<env>/worker-database 정적 KV 경로를 사용해야 하며(MUST), 각 destination은 role별 username과 password를 포함하는 Kubernetes basic-auth Secret이어야 한다(MUST).

#### Scenario: role별 VSO destination을 렌더함

- **WHEN** dev 또는 prod Helm release를 렌더한다
- **THEN** api-database와 worker-database VaultStaticSecret이 각각 나타난다
- **AND** 두 source path는 환경 segment와 role 이름이 분리된 정적 KV 경로를 사용한다
- **AND** destination 이름은 같은 release의 `*-postgres-api`와 `*-postgres-worker`이다
- **AND** destination type은 kubernetes.io/basic-auth이고 transformation은 username과 password만 포함한다
- **AND** cnpg.io/reload: "true" label과 정적 refresh 경계가 유지된다

#### Scenario: 공용·migration Secret과 role source를 혼합하지 않음

- **WHEN** role별 source를 추가한 manifest를 기존 공용 env와 migration manifest와 비교한다
- **THEN** 공용 env VaultStaticSecret과 prod migration-database VaultStaticSecret은 유지된다
- **AND** API source를 Worker destination이나 shared runtime Secret으로 재사용하지 않는다
- **AND** Vault password 값은 values, rendered manifest, OpenSpec 또는 로그에 나타나지 않는다

### Requirement: provisioning은 기존 connection과 후속 권한 경계를 보존한다

**Authority / Provenance:** Linear PROD-369; 기존 connection 계약은 openspec/specs/postgres-session-pool/spec.md와 openspec/specs/workload-postgres-credential-selection/spec.md를 따른다. 이 change는 기존 CloudNativePG PgBouncer와 owner/migration/replication/local/legacy SCRAM connection을 유지해야 한다(MUST). 새 role을 workload selector, URL, mount 또는 restart에 연결하거나 direct PostgreSQL endpoint/certificate 인증을 추가해서는 안 된다(MUST NOT).

#### Scenario: role provisioning만 배포함

- **WHEN** role과 role별 static Secret manifest만 적용 대상으로 검토한다
- **THEN** 기존 API/Web/Worker workload의 endpoint와 Secret selector는 이 change에서 바뀌지 않는다
- **AND** 기존 PgBouncer Service와 direct endpoint 선언은 삭제·대체되지 않는다
- **AND** pg_hba, TLS client certificate, certificate/CA mount, connection parameter와 rollout restart가 추가되지 않는다

#### Scenario: 후속 권한·handle·cutover 범위를 선점하지 않음

- **WHEN** PROD-724, PROD-710, PROD-715, PROD-716 또는 PROD-744의 작업과 이 change를 비교한다
- **THEN** 이 change에는 객체 GRANT/default privilege/RLS policy, explicit DB handle·SQL, Worker/API principal cutover 또는 dynamic secret이 없다
- **AND** 후속 issue가 독립적으로 승인·배포·rollback할 수 있는 경계가 보존된다

### Requirement: role declaration은 최소 권한과 보존 가능한 lifecycle을 명시한다

**Authority / Provenance:** Linear PROD-369. DatabaseRole 선언은 runtime role에 owner 또는 migration 권한을 부여하지 않아야 하며(MUST NOT), role 삭제가 PostgreSQL identity를 자동으로 제거하지 않도록 databaseRoleReclaimPolicy: retain을 유지해야 한다(MUST). 이 change는 객체 privilege 또는 ownership을 부여하지 않는다(MUST NOT).

#### Scenario: role attribute와 lifecycle을 확인함

- **WHEN** 두 DatabaseRole manifest를 정적으로 검토한다
- **THEN** superuser: false, createdb: false, createrole: false, replication: false와 inRoles: []가 양쪽에 명시된다
- **AND** databaseRoleReclaimPolicy: retain이 양쪽에 명시된다
- **AND** schema/table/sequence GRANT, default privilege, ownership 또는 grant option 선언이 없다
