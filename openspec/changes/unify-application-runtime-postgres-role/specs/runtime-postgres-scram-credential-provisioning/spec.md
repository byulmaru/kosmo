## MODIFIED Requirements

### Requirement: API와 Worker runtime role을 static SCRAM credential로 provision한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`. 모든 Helm 배포 환경은 API용 `kosmo_api`와 Worker용 `kosmo_worker` LOGIN을 각각 하나의 CloudNativePG DatabaseRole과 role별 static SCRAM passwordSecret으로 유지해야 한다(MUST). `kosmo_api` role/Secret provisioning과 existing ACL/default ACL은 PROD-781까지 rollback-compatible하게 유지하며, `kosmo_worker`는 `LOGIN NOBYPASSRLS`로 축소되어야 한다(MUST). 두 role은 owner·migration·Fedify queue role이 아니어야 한다(MUST NOT).

#### Scenario: 두 role provision과 Worker attribute를 렌더함

- **WHEN** 기존 owner workload가 실행 중인 dev 또는 prod Helm release를 렌더한다
- **THEN** release별 `*-postgres-api`와 `*-postgres-worker` DatabaseRole 및 role별 passwordSecret source가 나타나야 한다
- **AND** DatabaseRole의 PostgreSQL role name은 각각 `kosmo_api`와 `kosmo_worker`이고, 양쪽에 `login: true`, `inRoles: []`와 비상승 role attribute가 선언되어야 한다
- **AND** `kosmo_worker`에는 `bypassrls: false`가 선언되고, `kosmo_api` role/Secret provisioning은 PROD-781까지 유지되어야 한다
- **AND** workload manifest의 application consumer/SecretRef는 별도 workload contract에 따라 shared Worker source를 사용하며 role provisioning의 존속과 혼동하지 않아야 한다

#### Scenario: role별 static SCRAM source를 CNPG에 연결함

- **WHEN** DatabaseRole이 reconcile될 수 있는 manifest를 검토한다
- **THEN** API와 Worker DatabaseRole의 passwordSecret은 각각 같은 release의 role별 VSO destination Secret을 참조해야 한다
- **AND** `disablePassword`나 clientCertificate 설정, owner·migration·queue membership 선언은 나타나지 않아야 한다

### Requirement: role별 VaultStaticSecret이 basic-auth password source를 소유한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`. 모든 Helm 배포 환경은 API와 Worker에 독립된 `api-database`와 `worker-database` VaultStaticSecret을 유지해야 한다(MUST). source는 `kubernetes/kosmo/<env>/<role>-database` 정적 KV 경로를 사용하고(MUST), 각 destination은 role별 username과 password를 포함하는 Kubernetes basic-auth Secret이어야 한다(MUST). `kosmo_api` API role/Secret provisioning은 PROD-781까지 유지하며, application workload consumer가 이를 참조하지 않는 것은 workload credential-selection contract가 소유한다.

#### Scenario: role별 VSO destination을 렌더함

- **WHEN** dev 또는 prod Helm release를 렌더한다
- **THEN** api-database와 worker-database VaultStaticSecret 및 release-derived API/Worker destination이 나타나야 한다
- **AND** source path에는 환경 segment와 각 role이 포함되고 destination type은 `kubernetes.io/basic-auth`여야 하며 transformation은 username과 password만 포함해야 한다
- **AND** `cnpg.io/reload: "true"` label과 정적 refresh 경계를 유지해야 한다

#### Scenario: 공용·migration Secret과 role별 source를 혼합하지 않음

- **WHEN** role별 source를 기존 공용 env와 migration manifest와 비교한다
- **THEN** 공용 env VaultStaticSecret과 prod migration-database VaultStaticSecret은 유지되어야 한다
- **AND** API/Web/Worker/Fedify application workload는 shared Worker destination을 사용해야 하며 API role/Secret provisioning은 유지되고 Vault password value는 values/rendered manifest/OpenSpec/log에 나타나지 않아야 한다

### Requirement: provisioning은 기존 connection과 후속 권한 경계를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`, `PROD-781`. role provisioning은 기존 CloudNativePG direct endpoint와 retained Pooler resource, migration owner와 Fedify queue 경계를 보존해야 한다(MUST). `kosmo_api` role/ACL/Secret provisioning과 immutable migration/contract SQL은 PROD-781까지 이 capability에서 변경하지 않는다(MUST NOT). GraphQL/application policy, Worker/Fedify/Temporal 기능은 변경하지 않는다(MUST NOT).

#### Scenario: shared role provisioning과 workload consumer를 분리함

- **WHEN** role·Secret manifest와 application workload manifest를 비교한다
- **THEN** application workload가 shared `kosmo_worker` PG\* source를 소비하는 것은 확인할 수 있어야 한다
- **AND** migration owner·Fedify queue credential·Pooler resource는 별도 경계로 남아야 한다

#### Scenario: shared Secret rotation은 모든 application consumer를 재시작함

- **WHEN** `worker-database` VaultStaticSecret destination의 password가 갱신된다
- **THEN** API Rollout, Web Rollout, Temporal Worker Deployment와 Fedify consumer Deployment가 모두 해당 Secret 변경의 restart target으로 렌더되어야 한다
- **AND** 각 target은 동일한 `kosmo_worker` Secret `password` ref를 계속 사용해야 하며 migration Job과 Fedify MessageQueue consumer의 전용 credential은 restart target에 포함하지 않아야 한다

#### Scenario: workload transition과 후속 contract를 분리함

- **WHEN** PROD-712, PROD-780과 PROD-781의 범위를 이 change와 비교한다
- **THEN** owner `kosmo` credential/`NOLOGIN`은 PROD-712가, shared workload PG\* transition과 consumer/SecretRef 제거는 PROD-780이 소유해야 한다
- **AND** `kosmo_api` role/ACL/Secret provisioning 제거, ACL revoke/drop과 contract SQL은 PROD-781까지 이 change에 나타나지 않아야 하며 non-production role/Secret rendering verification만 이 change의 task로 추적되어야 한다

### Requirement: role declaration은 최소 권한과 보존 가능한 lifecycle을 명시한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`. retained API/Worker DatabaseRole 선언은 owner 또는 migration 권한을 부여하지 않아야 하며(MUST NOT), role 삭제가 PostgreSQL identity를 자동으로 제거하지 않도록 `databaseRoleReclaimPolicy: retain`을 유지해야 한다(MUST). 이 provisioning requirement는 role 선언에서 object grant/ownership을 직접 선언하지 않아야 하며, legacy role/ACL/Secret removal은 PROD-781 contract다(MUST NOT).

#### Scenario: role attribute와 lifecycle을 확인함

- **WHEN** API와 Worker DatabaseRole manifest를 정적으로 검토한다
- **THEN** 양쪽에 `superuser: false`, `createdb: false`, `createrole: false`, `replication: false`, `inRoles: []`와 `databaseRoleReclaimPolicy: retain`이 명시되어야 한다
- **AND** `kosmo_worker`는 `bypassrls: false`를 가져야 하며 schema/table/sequence GRANT, default privilege, ownership 또는 grant option 선언은 이 provisioning requirement에 없어야 한다
