## ADDED Requirements

### Requirement: Dev와 격리된 production Application

**Authority / Provenance:** Linear `PROD-562`, 통합 완료 책임 `PROD-545`. 시스템은 Argo CD가 `kosmo-prod` Application을 `kosmo-prod` namespace에 선언형으로 생성하고 항상 automated sync하게 해야 한다(MUST). Production Helm 입력은 dev와 다른 environment, namespace, public hostname, runtime secret path와 database 경계를 사용해야 한다(MUST). Bootstrap은 workload를 비활성화해야 하며(MUST), 이후 PROD-545가 설정한 immutable digest와 workload/migration Helm parameter를 Terraform이 제거해서는 안 된다(MUST NOT).

#### Scenario: Production Application 선언

- **WHEN** Terraform의 production Application을 계획하거나 렌더한다
- **THEN** `kosmo-prod` Application의 destination은 `kosmo-prod` namespace이고 automated sync와 production 전용 Helm 입력을 사용한다

#### Scenario: Release parameter 소유권 보존

- **WHEN** PROD-545 release workflow가 production Application에 digest와 workload/migration Helm parameter를 설정한 뒤 Terraform을 다시 적용한다
- **THEN** Terraform은 해당 parameter overlay를 보존하면서 bootstrap values와 나머지 Application 구조의 drift는 계속 조정한다

#### Scenario: 첫 release 전 bootstrap version

- **WHEN** PROD-545가 production release를 아직 배포하지 않았다
- **THEN** Application은 `0.0.0` bootstrap sentinel과 `workloads.enabled=false`를 유지하고 API/Web Service, Rollout과 HTTPRoute를 생성하지 않는다

#### Scenario: Dev 정책 격리

- **WHEN** production Helm manifest를 렌더한다
- **THEN** dev namespace, dev hostname, dev Vault path, dev 전용 database 설정과 `main` image version이 나타나지 않는다

#### Scenario: 기존 dev Application 보존

- **WHEN** 기존 dev ApplicationSet과 공용 Helm chart에서 dev manifest를 렌더한다
- **THEN** `kosmo-dev`의 현재 namespace, hostname, mutable `main` version과 dev 전용 database 동작은 유지되고 production resource는 나타나지 않는다

### Requirement: Production public route와 TLS 연결

**Authority / Provenance:** Linear `PROD-562`. 시스템은 production Web과 API Service를 서로 다른 production hostname의 HTTPRoute로 노출하고 기존 `gateway/public`의 HTTPS listener와 TLS certificate 경계에 연결해야 한다(MUST). Route는 자신의 namespace에 있는 active Service만 backend로 참조해야 하며(MUST), dev hostname을 공유해서는 안 된다(MUST NOT).

#### Scenario: Production Web route

- **WHEN** production Web HTTPRoute를 Gateway API controller가 조정한다
- **THEN** production Web hostname은 `gateway/public`의 호환되는 HTTPS listener에 수락되고 `kosmo-prod`의 Web active Service로 전달된다

#### Scenario: Production API route

- **WHEN** production API HTTPRoute를 Gateway API controller가 조정한다
- **THEN** production API hostname은 `gateway/public`의 호환되는 HTTPS listener에 수락되고 `kosmo-prod`의 API active Service로 전달된다

#### Scenario: TLS 연결 확인

- **WHEN** production hostname의 TLS 연결 상태를 확인한다
- **THEN** Gateway listener가 `kos.moe` certificate 경계로 유효한 인증서를 제공하고 HTTPRoute는 Accepted와 ResolvedRefs 상태를 가진다

### Requirement: Production PostgreSQL과 persistent storage

**Authority / Provenance:** Linear `PROD-562`, `PROD-546`. 시스템은 `kosmo-prod`에 primary 1개와 standby replica 2개, 총 3 instances의 production CloudNativePG Cluster와 persistent storage를 선언해야 한다(MUST). Cluster는 prod 전용 database identity와 storage를 dev와 공유해서는 안 되며(MUST NOT), 기존 production backup ServiceAccount, ObjectStore, Barman plugin WAL archiver와 ScheduledBackup 선언에 연결되어 PROD-546의 live backup/restore 검증 대상이 되어야 한다(MUST). API와 Web은 기존 read-write Service를 계속 사용해야 하며(MUST), read-only Service로 query를 분기해서는 안 된다(MUST NOT).

#### Scenario: Production database 렌더

- **WHEN** Helm chart를 production 값으로 렌더한다
- **THEN** `kosmo-prod`에 총 3 instances의 production CloudNativePG Cluster, 각 instance의 persistent storage, backup ServiceAccount, ObjectStore, WAL archiver와 ScheduledBackup 연결이 함께 나타난다

#### Scenario: Standby replica와 application 연결

- **WHEN** production Cluster와 API/Web workload를 렌더한다
- **THEN** Cluster는 standby replica 2개를 포함하고 API/Web `DATABASE_URL`은 read-write Service를 가리키며 read-only Service를 참조하지 않는다

#### Scenario: Dev database와 격리

- **WHEN** dev와 production manifest를 비교한다
- **THEN** 각 환경의 Cluster와 PVC는 namespace로 격리되고 dev manifest에는 production backup identity나 object-store 연결이 나타나지 않는다

#### Scenario: Backup 검증 선행 조건 제공

- **WHEN** production Cluster와 backup add-on이 Ready가 된다
- **THEN** PROD-546은 해당 Cluster에서 immediate backup, WAL archive와 격리 restore 검증을 시작할 수 있다

### Requirement: Production Vault runtime 환경값 경계

**Authority / Provenance:** Linear `PROD-562`. 시스템은 production runtime 환경값을 dev와 다른 Vault `kubernetes/kosmo/prod` path에서 production Kubernetes Secret으로 동기화해야 한다(MUST). API와 Web workload는 이 runtime Secret을 참조해야 하며(MUST), `kubernetes/kosmo/prod/runtime` path를 생성해서는 안 된다(MUST NOT). Repository와 rendered manifest에는 secret value가 포함되어서는 안 된다(MUST NOT).

#### Scenario: Runtime secret 동기화

- **WHEN** Vault Secrets Operator가 `kosmo-prod`의 runtime VaultStaticSecret을 조정한다
- **THEN** `kubernetes/kosmo/prod`의 값이 runtime Kubernetes Secret에 동기화되고 API와 Web Rollout이 그 Secret을 참조한다

#### Scenario: Runtime 하위 path 비생성

- **WHEN** production runtime VaultStaticSecret manifest를 렌더한다
- **THEN** path는 `kubernetes/kosmo/prod`이고 `kubernetes/kosmo/prod/runtime`을 참조하지 않는다

#### Scenario: Secret 환경 격리

- **WHEN** dev와 production manifest의 VaultAuth, VaultStaticSecret과 destination을 비교한다
- **THEN** production은 dev path나 destination을 참조하지 않고 어느 manifest에도 secret value가 포함되지 않는다

### Requirement: Migration DB identity와 credential 경계

**Authority / Provenance:** Linear `PROD-562`. 시스템은 API/Web의 runtime DB identity와 다른 production migration 전용 PostgreSQL login identity 및 credential Secret을 선언형으로 프로비저닝해야 한다(MUST). Migration credential은 database 인증에 필요한 username/password만 포함해야 하며(MUST), API/Web runtime 환경값 전체를 복제하거나 API/Web workload에 주입해서는 안 된다(MUST NOT). 이 change는 migration Secret을 실제 migration Job에 연결해서는 안 된다(MUST NOT).

#### Scenario: Migration DB identity 프로비저닝

- **WHEN** production PostgreSQL과 credential resource를 조정한다
- **THEN** runtime DB identity와 다른 migration login identity가 별도 basic-auth Secret의 credential로 인증할 수 있다

#### Scenario: Migration credential 최소 projection

- **WHEN** migration DB credential Vault projection을 렌더한다
- **THEN** `kubernetes/kosmo/prod/migration`에서 database username/password만 별도 basic-auth Secret으로 동기화하고 runtime 환경값을 복제하지 않는다

#### Scenario: API와 Web의 credential 격리

- **WHEN** production API와 Web Rollout을 렌더한다
- **THEN** 두 workload는 기존 runtime DB credential을 사용하고 migration DB Secret을 secretKeyRef나 envFrom으로 참조하지 않는다

#### Scenario: Migration consumer 비소유

- **WHEN** production manifest를 렌더한다
- **THEN** migration DB identity와 Secret은 존재하지만 이를 소비하는 production migration Job은 생성되지 않는다

### Requirement: Production runtime dependency와 readiness 검증

**Authority / Provenance:** Linear `PROD-562`, 통합 완료 책임 `PROD-545`. 시스템은 production runtime bootstrap을 동기화하기 전에 Argo CD, CloudNativePG, Barman Cloud plugin, Vault Secrets Operator 및 필요한 production ServiceAccount가 준비되었음을 확인할 수 있어야 한다(MUST). 선언은 Helm lint/render와 Kubernetes admission dry-run을 통과해야 하며(MUST), 동기화 뒤 PostgreSQL과 secret projection 상태를 확인할 수 있어야 한다(MUST).

#### Scenario: 선언형 사전 검증

- **WHEN** production runtime 변경을 cluster에 동기화하기 전에 검증한다
- **THEN** dev/prod Helm lint와 render 검사가 통과하고 production manifest가 server-side admission dry-run에서 수락된다

#### Scenario: Add-on 준비 실패

- **WHEN** 필수 CRD, controller, public Gateway, TLS certificate, Barman plugin 또는 Vault 인증 경계가 준비되지 않았다
- **THEN** 운영자는 Application sync 전에 실패한 dependency를 식별하고 production workload readiness를 완료로 기록하지 않는다

#### Scenario: Bootstrap readiness

- **WHEN** `kosmo-prod` Application sync가 완료된다
- **THEN** CloudNativePG Cluster와 Vault secret projection의 상태가 Ready 또는 정상 조정 상태임을 확인하고 API/Web workload와 public route는 존재하지 않는다

### Requirement: 후속 release와 migration 계약의 비소유

**Authority / Provenance:** Linear `PROD-562`, 통합 완료 책임 `PROD-545`. 이 capability는 production runtime bootstrap resource와 migration DB identity/credential 기반만 제공해야 한다(MUST). 시스템은 PROD-545의 release 선택·승인, workload/migration 활성화, restore rehearsal 연계, public 사용자 경로 smoke와 첫 release 완료 판단이나 application read-routing을 이 변경으로 구현해서는 안 된다(MUST NOT). 완료된 PROD-563/564 구현 이력은 보존해야 한다(MUST).

#### Scenario: Production runtime 변경 범위 검토

- **WHEN** 이 capability의 manifest, workflow와 검증 task를 검토한다
- **THEN** production Application, runtime 기반과 migration DB identity/Secret만 포함되고 release workflow, migration Secret consumer·Job/gate, application read-routing과 public 사용자 journey smoke는 포함되지 않는다

#### Scenario: Production migration 리소스 렌더

- **WHEN** 이 변경의 production Helm 값을 렌더한다
- **THEN** PROD-564가 소유할 production migration Job이나 destructive contract 실행 resource는 생성되지 않는다
