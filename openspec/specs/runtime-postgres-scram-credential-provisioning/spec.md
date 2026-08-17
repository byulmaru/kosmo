# runtime-postgres-scram-credential-provisioning Specification

## Purpose

API와 Worker legacy role 및 새 `kosmo_runtime` 비소유 PostgreSQL LOGIN과 role별 Vault/VSO static SCRAM credential을 provision하고, application runtime Secret rotation restart target을 연결하는 계약을 정의한다. Legacy role·ACL·Secret provisioning은 후속 contract와 rollback window까지 유지하며 객체 ACL contract 제거와 production 운영 authorization은 별도 승인 범위다.

## Requirements

### Requirement: API·Worker legacy role와 shared runtime role을 static SCRAM credential로 provision한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`, `PROD-781`, `PROD-782`. 모든 Helm 배포 환경은 기존 API용 `kosmo_api`와 Worker용 `kosmo_worker` LOGIN role·role별 static SCRAM passwordSecret을 rollback window까지 유지하고, 새 application runtime용 `kosmo_runtime` LOGIN을 하나의 CloudNativePG DatabaseRole과 release-derived static SCRAM passwordSecret으로 추가 provision해야 한다(MUST). `kosmo_runtime`는 `NOBYPASSRLS`여야 하며(MUST), 세 role은 owner·migration·Fedify queue role이 아니어야 한다(MUST NOT).

#### Scenario: 세 role provision과 runtime attribute를 렌더함

- **WHEN** dev 또는 prod Helm release를 렌더한다
- **THEN** `kosmo_api`, `kosmo_worker`, `kosmo_runtime` DatabaseRole 및 legacy/runtime passwordSecret source가 나타나야 한다
- **AND** 세 role의 PostgreSQL role name은 각각 `kosmo_api`, `kosmo_worker`, `kosmo_runtime`이고, 각 role에 `login: true`, `inRoles: []`와 비상승 role attribute가 선언되어야 한다
- **AND** `kosmo_runtime`에는 `bypassrls: false`, legacy `kosmo_worker`에는 기존 `bypassrls: true`가 선언되어야 하며 기존 API/Worker role·Secret provisioning은 제거되지 않아야 한다
- **AND** application workload consumer/SecretRef는 별도 workload contract에 따라 `kosmo_runtime` source를 사용해야 한다

#### Scenario: role별 static SCRAM source를 CNPG에 연결함

- **WHEN** DatabaseRole이 reconcile될 수 있는 manifest를 검토한다
- **THEN** 각 DatabaseRole의 passwordSecret은 같은 release의 role별 VSO destination Secret을 참조해야 한다
- **AND** `disablePassword`나 clientCertificate 설정, owner·migration·queue membership 선언은 나타나지 않아야 한다

### Requirement: role별 VaultStaticSecret이 legacy와 runtime password source를 소유한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`, `PROD-781`, `PROD-782`. 모든 Helm 배포 환경은 기존 `api-database`와 `worker-database` VaultStaticSecret을 유지하고, 새 `runtime-database` VaultStaticSecret을 추가해야 한다(MUST). runtime source는 `kubernetes/kosmo/<env>/runtime-database` release-derived static KV path를 사용하고(MUST), destination은 `kosmo_runtime` username/password를 포함하는 Kubernetes basic-auth Secret이어야 한다(MUST). 기존 API/Worker Secret provisioning은 후속 contract 전까지 제거하지 않는다(MUST NOT).

#### Scenario: legacy와 runtime VSO destination을 렌더함

- **WHEN** dev 또는 prod Helm release를 렌더한다
- **THEN** api-database, worker-database와 runtime-database VaultStaticSecret 및 release-derived destination이 나타나야 한다
- **AND** runtime source path에는 환경 segment와 `runtime-database`가 포함되고 destination type은 `kubernetes.io/basic-auth`여야 하며 transformation은 username과 password만 포함해야 한다
- **AND** `cnpg.io/reload: "true"` label과 정적 refresh 경계를 유지해야 한다

#### Scenario: 공용·migration·queue Secret과 runtime source를 혼합하지 않음

- **WHEN** role별 source를 기존 공용 env, migration과 queue manifest와 비교한다
- **THEN** 공용 env, prod migration-database와 Fedify queue Secret은 유지되어야 한다
- **AND** API/Web/Worker/Fedify application workload는 shared runtime destination을 사용하며 legacy API/Worker Secret provisioning은 유지되고 Vault password value는 values/rendered manifest/OpenSpec/log에 나타나지 않아야 한다

### Requirement: provisioning은 기존 connection과 후속 권한 경계를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`, `PROD-781`, `PROD-782`. role provisioning은 기존 CloudNativePG direct endpoint와 retained Pooler resource, migration owner와 Fedify queue 경계를 보존해야 한다(MUST). `kosmo_api`·`kosmo_worker` role/ACL/Secret provisioning과 immutable migration history는 각 후속 issue까지 유지해야 하며(MUST). GraphQL/application policy, Worker/Fedify/Temporal 기능은 변경하지 않는다(MUST NOT).

#### Scenario: runtime role provisioning과 workload consumer를 분리함

- **WHEN** role·Secret manifest와 application workload manifest를 비교한다
- **THEN** application workload가 `kosmo_runtime` PG\* source를 소비하는 것은 확인할 수 있어야 한다
- **AND** legacy role provisioning, migration owner·Fedify queue credential·Pooler resource는 별도 경계로 남아야 한다

#### Scenario: runtime Secret rotation은 application consumer만 재시작함

- **WHEN** runtime-database VaultStaticSecret destination의 password가 갱신된다
- **THEN** API Rollout, Web Rollout, Temporal Worker Deployment와 Fedify consumer Deployment가 모두 해당 runtime Secret 변경의 restart target으로 렌더되어야 한다
- **AND** 각 target은 동일한 `kosmo_runtime` Secret `password` ref를 계속 사용해야 하며 migration Job과 Fedify MessageQueue consumer의 전용 credential은 restart target에 포함하지 않아야 한다
- **AND** legacy API/Worker Secret provisioning은 유지되어야 하지만 해당 Secret을 소비하지 않는 application workload의 restart target으로 남아서는 안 된다

#### Scenario: legacy contract와 workload transition을 분리함

- **WHEN** PROD-712, PROD-780, PROD-781과 PROD-782의 범위를 이 change와 비교한다
- **THEN** shared workload PG\* transition, runtime role/Secret, additive ACL migration과 consumer/SecretRef 전환은 PROD-780이 소유해야 한다
- **AND** `kosmo_api` contract removal은 PROD-781, `kosmo_worker` contract removal은 PROD-782, owner `kosmo` credential/`NOLOGIN`은 PROD-712가 소유하며 이 change에서 선반영하지 않아야 한다

### Requirement: role declaration은 최소 권한과 보존 가능한 lifecycle을 명시한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-780`. 세 DatabaseRole 선언은 owner 또는 migration 권한을 부여하지 않아야 하며(MUST NOT), role 삭제가 PostgreSQL identity를 자동으로 제거하지 않도록 `databaseRoleReclaimPolicy: retain`을 유지해야 한다(MUST). role declaration에서 object grant/ownership을 직접 선언하지 않아야 하며(MUST NOT), legacy role/Secret removal은 후속 contract다.

#### Scenario: role attribute와 lifecycle을 확인함

- **WHEN** API, Worker와 runtime DatabaseRole manifest를 정적으로 검토한다
- **THEN** 각 role에 `superuser: false`, `createdb: false`, `createrole: false`, `replication: false`, `inRoles: []`와 `databaseRoleReclaimPolicy: retain`이 명시되어야 한다
- **AND** `kosmo_runtime`는 `bypassrls: false`를 가져야 하며 schema/table/sequence GRANT, default privilege, ownership 또는 grant option 선언은 이 provisioning requirement에 없어야 한다
