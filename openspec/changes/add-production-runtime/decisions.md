## Context

이 결정 기록은 2026-07-30에 정정된 Linear `PROD-562`의 독립 `production-runtime` 계약, 현재 Kosmo ApplicationSet/Helm/Vault/CNPG 구성, Kubernetes platform의 public Gateway/TLS 및 add-on 경계와 `PROD-546`의 기존 production backup 계약을 반영한다.

## Decision Records

### PROD-562 독립 capability와 후속 계약 분리

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Production runtime 기반과 release·migration·첫 출시 통합 계약의 OpenSpec ownership을 명확히 해야 한다.
- Decision Outcome: `PROD-562`가 `production-runtime` capability의 OpenSpec, 구현, 검증과 archive를 자체 소유한다. 이 change는 `kosmo-prod` Application/namespace, automated sync와 pinned image version, route/TLS 연결, 총 3 instances의 PostgreSQL/storage/backup 연결, production runtime 환경값 projection, 분리된 migration DB identity/credential 기반과 readiness만 포함한다.
- Alternatives Considered: `PROD-545` 전체를 하나의 공유 change로 묶는 방식은 최신 Linear ownership과 맞지 않아 제외했다. PROD-563/564/565 계약을 이 change에 포함하는 방식도 독립 delivery와 검증 경계를 침범해 제외했다.
- Consequences: PROD-562는 runtime readiness가 증명되면 독립 archive할 수 있다. Release pipeline, production migration gate와 첫 release 통합 검증은 이 change가 완료되어도 별도로 남는다.
- Confirmation / Follow-up: Diff와 tasks에 PROD-563/564/565 소유 resource나 검증이 없는지 확인한다.

### Production public hostname

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Production Web/API가 dev와 다른 public hostname으로 기존 `kos.moe` Gateway/TLS 경계를 사용해야 한다.
- Decision Outcome: Web hostname은 apex `kos.moe`, API hostname은 `api.kos.moe`로 둔다. 두 HTTPRoute는 기존 `gateway/public`을 parent로 사용하고 TLS는 platform이 소유한 `kos.moe`/`*.kos.moe` certificate에서 종료한다.
- Alternatives Considered: Web을 `www.kos.moe`로 두는 방식은 현재 서비스 canonical origin과 맞지 않아 제외했다. API를 Web origin 아래 path로 합치는 방식은 기존 별도 API route 구조를 바꾸므로 제외했다. Kosmo chart가 Certificate를 직접 소유하는 방식은 platform TLS ownership과 중복되어 제외했다.
- Consequences: DNS와 wildcard/apex certificate가 먼저 준비되어야 한다. Kosmo repository는 hostname과 Route만 소유하고 Gateway, Certificate, ClusterIssuer와 DNS credential은 소유하지 않는다.
- Confirmation / Follow-up: Render에서 두 hostname과 parentRef를 확인하고 live HTTPRoute Accepted/ResolvedRefs 및 TLS certificate를 확인한다.

### Production runtime 환경값과 migration DB credential의 분리

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Production runtime 환경값은 dev와 격리해야 하고 migration은 API/Web runtime과 다른 DB credential 경계가 필요하지만, migration용으로 API/Web의 전체 runtime 환경값을 복제해서는 안 된다.
- Decision Outcome: 기존 환경별 projection 구조를 재사용해 production runtime 환경값은 `kubernetes/kosmo/prod` Vault KV path에서 `env` Kubernetes Secret으로 동기화하고 API/Web과 rollout restart target이 이를 소비한다. 별도 migration projection은 `kubernetes/kosmo/prod/migration`에서 database username/password만 `kubernetes.io/basic-auth` Secret으로 동기화한다. `/prod/runtime` path는 만들지 않으며 API/Web은 migration Secret을 소비하지 않는다.
- Alternatives Considered: Runtime 환경값을 `kubernetes/kosmo/prod/runtime`으로 옮기는 방식은 기존 환경별 path 계약과 맞지 않아 제외했다. Migration Secret에 API/Web runtime 환경값 전체를 복제하는 방식은 credential 경계를 불필요하게 넓혀 제외했다. Secret value를 Helm/Terraform 입력으로 전달하는 방식은 manifest/state 노출 위험 때문에 제외했다.
- Consequences: Application sync 전에 두 production Vault path와 각 key가 준비되어야 한다. PROD-562는 migration DB credential을 프로비저닝하지만 실제 migration Job 연결과 소비는 PROD-564가 소유한다.
- Confirmation / Follow-up: Render와 live VSO 상태에서 runtime/migration path, 각 destination/type, API/Web 참조 격리와 secret value 비노출을 확인한다.

### 별도 migration DB login identity

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Secret만 분리하고 PostgreSQL login을 공유하면 credential rotation과 소비 경계가 실제 database identity에서 분리되지 않는다. 반면 이번 change는 migration privilege 자체를 재설계하지 않는다.
- Decision Outcome: CloudNativePG `DatabaseRole`로 `kosmo_migration` login role을 선언하고 migration basic-auth Secret을 `passwordSecret`으로 참조한다. Role은 login 가능, superuser 불가로 두고 기존 `kosmo` database owner role membership을 상속해 현재 migration 권한을 유지한다. API/Web은 기존 bootstrap owner의 `-app` Secret과 `-rw` Service를 계속 사용한다. DatabaseRole reclaim은 `retain`으로 두며 DatabaseRole과 migration VaultStaticSecret prune에는 명시적 확인을 요구한다.
- Alternatives Considered: Runtime과 migration이 같은 login/Secret을 공유하는 방식은 확정된 credential 경계를 충족하지 못해 제외했다. 이 change에서 별도 least-privilege migration grant 체계를 설계하는 방식은 migration 실행·contract 정책까지 범위를 넓혀 제외했다.
- Consequences: Runtime과 migration은 서로 다른 login과 credential을 갖지만 migration role은 기존 owner 권한을 상속하므로 권한 수준 자체를 축소하는 계약은 아니다. Application/manifest가 제거되어도 schema object를 소유할 수 있는 login은 자동 삭제되지 않으며, 제거 또는 rotation에는 명시적인 운영 확인이 필요하다. Migration Job이 이 identity를 소비하는 연결은 PROD-564까지 존재하지 않는다.
- Confirmation / Follow-up: Render와 live 상태에서 `DatabaseRole`, basic-auth Secret 참조와 role membership을 확인하고 API/Web이 migration credential을 참조하지 않는지 검사한다.

### 기존 platform add-on과 TLS의 소비

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Production runtime에 필요한 controller와 TLS 기반이 이미 cluster-wide ownership으로 존재하며 Kosmo가 중복 설치하면 lifecycle과 권한이 충돌한다.
- Decision Outcome: Argo CD/Rollouts, Gateway API `gateway/public`, cert-manager TLS, CloudNativePG, Barman Cloud plugin, Vault Secrets Operator와 EKS Pod Identity를 선행 dependency로 확인해 소비한다. Kosmo change는 add-on 설치나 public Gateway/TLS resource를 만들지 않는다.
- Alternatives Considered: Kosmo Terraform/Helm에서 add-on을 재설치하거나 Certificate를 생성하는 방식은 중복 ownership과 upgrade 순서 충돌 때문에 제외했다.
- Consequences: Dependency가 준비되지 않으면 `kosmo-prod` sync/readiness를 완료할 수 없다. 외부 platform 변경이 필요하면 이 change의 숨은 task로 추가하지 않고 해당 owner에서 먼저 처리해야 한다.
- Confirmation / Follow-up: Sync 전에 CRD/controller, public Gateway listener/certificate, Barman plugin, VSO와 Pod Identity 상태를 확인한다.

### Automated sync와 명시적인 image version

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-562`
- Status: Active
- Context / Problem: Production은 GitOps 자동 수렴을 유지해야 하지만 workload image가 mutable tag를 자동 추적해서는 안 된다.
- Decision Outcome: `kosmo-prod`는 automated sync, prune와 self-heal을 항상 사용한다. Workload image version은 Application 선언에 명시된 non-`main` immutable version으로 고정하고 version 변경은 Git의 명시적인 선언 변경으로만 수행한다. 이 change는 version 선택·승인·rollback workflow를 만들지 않는다.
- Alternatives Considered: Manual sync는 항상 자동이어야 한다는 production 운영 계약과 맞지 않아 제외했다. `main` 또는 `stable` 자동 추적은 image identity가 선언 밖에서 이동하므로 제외했다.
- Consequences: Git의 production manifest 변경은 Argo CD가 자동 반영한다. 정식 version을 어떤 절차로 선택·승인·되돌릴지는 별도 release pipeline 계약이 계속 소유한다.
- Confirmation / Follow-up: Application에 automated/prune/self-heal이 있고 선언에 명시된 version이 workload image에 사용되는지 확인한다. Version 형식과 release 선택 정책은 PROD-563이 소유한다.

### 첫 release 전 bootstrap image version

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 정정, Linear `PROD-562`와 `PROD-563` ownership 경계
- Status: Active
- Context / Problem: PROD-562의 선언형 runtime 구현 시점에는 production-built image가 아직 없으며, 이를 이유로 PROD-562가 one-off image build나 PROD-563 release workflow를 소유해서는 안 된다.
- Decision Outcome: `kosmo-prod` Application에는 의도적으로 존재하지 않는 `0.0.0` bootstrap version을 명시한다. Application은 automated sync를 유지하지만 이 version을 workload readiness 증거로 사용하지 않는다. PROD-563이 첫 production-built immutable release version을 선택해 명시적으로 교체한다.
- Alternatives Considered: `main`, `stable` 또는 현재 dev용 `sha-*` image를 사용하는 방식은 production build 경계와 mutable-tag 금지를 위반해 제외했다. PROD-562가 one-off production image를 만드는 방식은 PROD-563 ownership을 침범해 제외했다.
- Consequences: 선언과 admission 검증은 production image 없이 완료할 수 있지만 실제 API/Web readiness는 첫 production image와 runtime key가 준비될 때까지 완료되지 않는다. 개별 PR readiness와 OpenSpec 전체 runtime readiness는 별도로 판정한다.
- Confirmation / Follow-up: Terraform declaration과 plan에서 `version: '0.0.0'`이 명시되어 있는지 확인한다. PROD-563은 이 값을 production image version으로 교체한다.

### Production Application lifecycle 분리

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-562`의 production database 보존 계약
- Status: Active
- Context / Problem: Shared ApplicationSet의 resource preservation을 켜면 dev Application 삭제 lifecycle도 바뀌고, 켜지 않으면 production Application 제거가 Cluster/PVC 삭제로 이어질 수 있다.
- Decision Outcome: 기존 dev ApplicationSet은 변경하지 않고 production을 별도 Terraform `argocd_application` resource로 선언한다. Production Application은 `cascade=false`를 사용하며 Cluster, ObjectStore, migration DatabaseRole과 migration VaultStaticSecret의 prune에는 명시적 확인을 요구한다.
- Alternatives Considered: Shared ApplicationSet에 `preserveResourcesOnDeletion`을 설정하는 방식은 dev scope를 불필요하게 변경해 제외했다. 데이터 resource에 아무 보호도 두지 않는 방식은 자동 prune과 실수 삭제 위험 때문에 제외했다.
- Consequences: Production Application lifecycle과 dev lifecycle이 분리되고 Application 제거만으로 production resource가 연쇄 삭제되지 않는다. 실제 데이터 resource 제거에는 별도의 명시적 확인 및 운영 절차가 필요하다.
- Confirmation / Follow-up: Terraform schema/plan에서 `cascade=false`를 확인하고 production manifest 검토에서 보호 대상 resource의 `Prune=confirm` annotation을 확인한다.

### Primary 1개와 standby replica 2개

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-562`, `PROD-546`
- Status: Active
- Context / Problem: Production PostgreSQL은 두 standby를 갖는 HA 기반을 제공해야 하지만 application read-routing과 별도 replica cluster는 현재 범위가 아니다.
- Decision Outcome: Production CloudNativePG Cluster는 `instances: 3`으로 primary 1개와 standby replica 2개를 사용한다. 기존 10Gi per-instance storage와 prod-only backup ServiceAccount/ObjectStore/Barman WAL/ScheduledBackup 선언을 같은 Cluster에 연결한다. API/Web은 기존 read-write Service를 유지하고 read-only Service를 사용하지 않는다.
- Alternatives Considered: 총 2 instances는 standby가 1개뿐이라 확정된 두-replica 계약을 충족하지 못해 제외했다. 단일 instance는 production HA를 제공하지 못해 제외했다. Application read-routing이나 standalone/cross-cluster replica는 독립적인 consistency와 운영 계약이 필요해 제외했다.
- Consequences: 세 Pod와 PVC의 compute/storage 비용이 발생한다. Standby는 HA와 failover에 사용 가능하지만 API/Web read 부하는 자동 분산되지 않는다.
- Confirmation / Follow-up: Prod render와 live Cluster에서 총 3 instances/Pods와 persistent storage를 확인하고 API/Web `DATABASE_URL`이 `-rw`를 유지하는지 검증한 뒤 PROD-546 live 검증을 연다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
