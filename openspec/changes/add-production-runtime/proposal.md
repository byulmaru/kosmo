## Why

Kosmo의 ApplicationSet은 dev 환경만 선언하고 있어 API, Web, PostgreSQL을 dev와 분리된 production namespace, domain, secret, storage 경계에서 실행할 수 없다. PROD-562는 release·migration·첫 출시 검증과 분리해 `kosmo-prod`의 선언형 runtime 기반을 먼저 제공하고, PROD-546의 실제 backup/restore 검증이 사용할 production Cluster를 연다.

## What Changes

- dev와 독립된 `kosmo-prod` Argo CD Application과 `kosmo-prod` namespace를 선언한다.
- production 전용 Helm values에서 Web/API hostname, environment, runtime secret reference, 총 3 instances의 PostgreSQL/storage와 backup 연결을 구성한다.
- API와 Web Service·HTTPRoute가 이후 PROD-545 release에서 production public gateway의 `kos.moe` TLS 경계에 연결될 production 입력을 선언한다.
- production runtime 환경값은 dev와 분리된 Vault `kubernetes/kosmo/prod` path에서 동기화하고 `/prod/runtime` path를 만들지 않는다.
- Production runtime의 역사적 migration identity/credential 기반은 PROD-712가 CNPG-generated owner 직접 연결로 대체하고 obsolete DatabaseRole/VaultStaticSecret을 제거한다.
- `kosmo-prod`는 automated sync를 유지하고 유효한 immutable digest가 지정된 release에서 application workloads를 함께 render한다. Terraform은 PROD-545가 설정한 release parameter overlay를 보존하며 별도 workload activation key를 소유하지 않는다.
- CloudNativePG, Barman Cloud plugin과 Vault Secrets Operator 등 bootstrap 선행 add-on의 준비 상태를 확인하고 database·backup·Secret 기반 readiness까지 검증한다.
- dev render에 production resource, secret path, backup 설정 또는 production image policy가 섞이지 않음을 검증한다.
- 정식 release workflow, migration/contract gate, public 사용자 경로 smoke와 첫 release 통합 검증은 추가하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음.
- Linear Contract: `PROD-562`
- Linear Implementations: 없음. `PROD-562`가 OpenSpec, 구현, 검증과 archive를 함께 소유한다.

## Capabilities

### New Capabilities

- `production-runtime`: dev와 격리된 production Application, namespace, automated sync와 고정 image version, public routing/TLS, 총 3 instances의 PostgreSQL/storage, Vault runtime 환경값, CNPG-managed migration owner credential과 readiness 계약.

### Modified Capabilities

없음.

## Impact

- `apps/terraform/argocd.tf`: dev ApplicationSet과 lifecycle을 분리한 `kosmo-prod` Application 및 production Helm input.
- `apps/helm`: prod values, 환경별 render 경계, production runtime 환경값 projection, CNPG-managed migration owner credential, route와 workload/database 구성.
- Helm render/admission 검증: dev/prod 격리와 production runtime manifest 확인.
- EKS add-on 경계: Argo CD/Rollouts, Gateway API와 `gateway/public`, cert-manager TLS, CloudNativePG/Barman plugin, Vault Secrets Operator, EKS Pod Identity.
- 후속 관계: production Cluster가 준비되면 `PROD-546`의 live backup/restore 검증을 진행한다. 이후 release 선택·승인, migration 연동, public smoke와 첫 release 완료 판단은 `PROD-545`가 소유한다. chart에는 workload activation key가 없으며, 완료된 `PROD-563`/`PROD-564` 구현 이력은 보존한다.
